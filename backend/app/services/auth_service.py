"""Auth business logic: validate initData, upsert user, issue JWT."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import (
    InitDataError,
    create_access_token,
    validate_init_data,
)
from app.models.user import User


async def authenticate_telegram(
    session: AsyncSession,
    init_data: str,
    settings: Settings,
) -> tuple[User, str]:
    """Validate initData, create/update user, return (user, jwt)."""
    try:
        validated = validate_init_data(init_data, settings.bot_token)
    except InitDataError:
        raise

    tg_user = validated.user
    result = await session.execute(
        select(User).where(
            User.telegram_id == tg_user.id,
            User.is_deleted.is_(False),
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            telegram_id=tg_user.id,
            username=tg_user.username,
            anthropometry={
                k: v
                for k, v in {
                    "first_name": tg_user.first_name,
                    "last_name": tg_user.last_name,
                    "tg_first_name": tg_user.first_name,
                    "tg_last_name": tg_user.last_name,
                    "language_code": tg_user.language_code,
                }.items()
                if v
            },
        )
        session.add(user)
    else:
        # Keep username + TG name in sync with Telegram
        if tg_user.username is not None:
            user.username = tg_user.username
        anthro = dict(user.anthropometry or {}) if isinstance(user.anthropometry, dict) else {}
        if tg_user.first_name:
            anthro["first_name"] = tg_user.first_name
            anthro["tg_first_name"] = tg_user.first_name
        if tg_user.last_name:
            anthro["last_name"] = tg_user.last_name
            anthro["tg_last_name"] = tg_user.last_name
        if tg_user.language_code:
            anthro["language_code"] = tg_user.language_code
        if anthro != (user.anthropometry or {}):
            from sqlalchemy.orm.attributes import flag_modified

            user.anthropometry = anthro
            flag_modified(user, "anthropometry")

    await session.commit()
    await session.refresh(user)

    token = create_access_token(
        subject=str(user.id),
        telegram_id=user.telegram_id,
        settings=settings,
    )
    return user, token
