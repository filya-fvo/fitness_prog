"""FastAPI dependencies (auth context for protected routes)."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.services import scheduler as scheduler_service
from app.services import subscription_service

bearer_scheme = HTTPBearer(auto_error=True)


def plus_required_detail(feature: str, message: str) -> dict[str, str]:
    """Build the stable public error contract used by every PLUS boundary."""

    return {
        "code": "plus_required",
        "feature": feature,
        "message": message,
    }


def raise_plus_required(feature: str, message: str) -> None:
    logger.info("plus_required_api_denied feature={}", feature)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=plus_required_detail(feature, message),
    )


async def user_has_plus(session: AsyncSession, user: User) -> bool:
    """Resolve access from the current database state, never from the JWT."""

    return await subscription_service.has_entitlement(session, user.id, "plus")


async def ensure_plus(
    session: AsyncSession,
    user: User,
    *,
    feature: str,
    message: str,
) -> None:
    if not await user_has_plus(session, user):
        raise_plus_required(feature, message)


def require_plus(
    feature: str,
    message: str,
) -> Callable[..., Awaitable[User]]:
    """Create a FastAPI dependency for one named premium feature."""

    async def dependency(
        session: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        await ensure_plus(
            session,
            user,
            feature=feature,
            message=message,
        )
        return user

    return dependency


async def ensure_plus_for_past_date(
    session: AsyncSession,
    user: User,
    requested_day: date,
    *,
    feature: str,
    message: str,
    now: datetime | None = None,
) -> None:
    """Keep today's form free while protecting earlier local calendar days."""

    local_day = user_local_day(user, now=now)
    if requested_day < local_day:
        await ensure_plus(
            session,
            user,
            feature=feature,
            message=message,
        )


def user_local_day(user: User, *, now: datetime | None = None) -> date:
    """Return the calendar date used by user-facing dated resources."""

    return scheduler_service.local_schedule_day(
        user.goals or {},
        now=now or datetime.now(UTC),
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    """Resolve Bearer JWT to an active User row."""
    token = credentials.credentials
    try:
        payload = decode_access_token(token, settings=settings)
        subject = payload.get("sub")
        if not subject:
            raise JWTError("missing sub")
        user_id = uuid.UUID(str(subject))
    except (JWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия недействительна или истекла",
        ) from exc

    result = await session.execute(
        select(User).where(User.id == user_id, User.is_deleted.is_(False))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден",
        )
    return user


def user_is_admin(user: User, settings: Settings | None = None) -> bool:
    """True if user is configured bot owner / admin."""
    cfg = settings or get_settings()
    ids = cfg.admin_telegram_id_set
    if user.telegram_id is not None and ids and int(user.telegram_id) in ids:
        return True
    names = cfg.admin_username_set
    uname = (user.username or "").strip().lstrip("@").lower()
    if uname and uname in names:
        return True
    # If nothing configured, deny admin (safer default).
    return False


async def require_admin(
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> User:
    """Protect admin-only write routes."""
    if not user_is_admin(user, settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуются права администратора",
        )
    return user


async def require_system_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    """Authorize read-only diagnostics even while PostgreSQL is unavailable.

    A signed JWT claim can bypass the DB lookup only for an explicitly configured
    numeric Telegram ID. Username-based admins still use the active User row.
    """
    try:
        payload = decode_access_token(credentials.credentials, settings=settings)
        subject = uuid.UUID(str(payload.get("sub") or ""))
        telegram_id = payload.get("telegram_id")
    except (JWTError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия недействительна или истекла",
        ) from exc

    if (
        isinstance(telegram_id, int)
        and settings.admin_telegram_id_set
        and telegram_id in settings.admin_telegram_id_set
    ):
        try:
            result = await session.execute(
                select(User).where(User.id == subject, User.is_deleted.is_(False))
            )
        except Exception as exc:
            logger.warning("system_admin_db_unavailable err_type={}", type(exc).__name__)
            return
        user = result.scalar_one_or_none()
        if (
            user is not None
            and user.telegram_id == telegram_id
            and user_is_admin(user, settings)
        ):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуются права администратора",
        )

    result = await session.execute(
        select(User).where(User.id == subject, User.is_deleted.is_(False))
    )
    user = result.scalar_one_or_none()
    if user is None or not user_is_admin(user, settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуются права администратора",
        )
