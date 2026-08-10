"""Email OTP login: request code + verify → JWT."""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token
from app.models.email_otp import EmailOtpCode
from app.models.user import User
from app.services.email_service import send_login_otp_email

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if not email or not _EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректный email",
        )
    return email


def _hash_code(code: str, settings: Settings) -> str:
    # Bind hash to app secret so DB dump alone is not enough offline.
    msg = f"email-otp:{code}".encode("utf-8")
    key = settings.jwt_secret.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def _generate_code(length: int) -> str:
    n = max(4, min(8, int(length or 6)))
    # Cryptographically strong numeric OTP, zero-padded.
    upper = 10**n
    return str(secrets.randbelow(upper)).zfill(n)


async def _issue_otp(
    session: AsyncSession,
    *,
    email: str,
    purpose: str,
    settings: Settings,
    request_ip: str | None = None,
    user_id=None,
) -> dict:
    """Create OTP row and send email."""
    now = datetime.now(UTC)
    resend_sec = max(15, int(settings.email_otp_resend_seconds))

    recent = await session.scalar(
        select(EmailOtpCode)
        .where(
            func.lower(EmailOtpCode.email) == email,
            EmailOtpCode.purpose == purpose,
            EmailOtpCode.consumed_at.is_(None),
            EmailOtpCode.created_at >= now - timedelta(seconds=resend_sec),
        )
        .order_by(EmailOtpCode.created_at.desc())
        .limit(1)
    )
    if recent is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Код уже отправлен. Повторите через {resend_sec} сек.",
        )

    code = _generate_code(settings.email_otp_length)
    ttl_min = max(1, int(settings.email_otp_ttl_minutes))
    row = EmailOtpCode(
        email=email,
        purpose=purpose,
        code_hash=_hash_code(code, settings),
        user_id=user_id,
        expires_at=now + timedelta(minutes=ttl_min),
        max_attempts=max(1, int(settings.email_otp_max_attempts)),
        request_ip=(request_ip or "")[:64] or None,
    )
    session.add(row)
    await session.commit()

    sent = False
    send_error: str | None = None
    try:
        sent = await send_login_otp_email(settings=settings, to_email=email, code=code)
    except Exception as exc:
        send_error = str(exc)
        logger.warning("email_otp_send_error email={} purpose={} err={}", email, purpose, send_error)

    if settings.environment != "production":
        logger.info("email_otp_dev email={} purpose={} code={} sent={}", email, purpose, code, sent)

    out: dict = {
        "ok": True,
        "email": email,
        "expires_in_sec": ttl_min * 60,
        "resend_after_sec": resend_sec,
        "delivery": "smtp" if sent else "dev_log",
        "message": (
            "Код отправлен на почту."
            if sent
            else "SMTP не настроен или отправка не удалась. В development код смотрите в логах API."
        ),
    }
    if (
        not sent
        and settings.environment != "production"
        and settings.email_otp_dev_return_code
    ):
        out["dev_code"] = code
    if send_error and settings.environment != "production":
        out["dev_send_error"] = send_error
    return out


async def request_login_code(
    session: AsyncSession,
    *,
    email_raw: str,
    settings: Settings,
    request_ip: str | None = None,
) -> dict:
    """Create login OTP and send email."""
    email = normalize_email(email_raw)
    return await _issue_otp(
        session,
        email=email,
        purpose="login",
        settings=settings,
        request_ip=request_ip,
    )


async def request_link_code(
    session: AsyncSession,
    *,
    user: User,
    email_raw: str,
    settings: Settings,
    request_ip: str | None = None,
) -> dict:
    """Send OTP to attach email to the currently authenticated account."""
    email = normalize_email(email_raw)
    current = (getattr(user, "auth_email", None) or "").strip().lower()
    if current and current == email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Эта почта уже привязана к вашему аккаунту",
        )

    owner = await session.scalar(
        select(User).where(
            func.lower(User.auth_email) == email,
            User.is_deleted.is_(False),
        )
    )
    if owner is not None and owner.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Эта почта уже привязана к другому аккаунту",
        )

    return await _issue_otp(
        session,
        email=email,
        purpose="link",
        settings=settings,
        request_ip=request_ip,
        user_id=user.id,
    )


async def _load_valid_otp(
    session: AsyncSession,
    *,
    email: str,
    code: str,
    purpose: str,
    settings: Settings,
) -> EmailOtpCode:
    now = datetime.now(UTC)
    row = await session.scalar(
        select(EmailOtpCode)
        .where(
            func.lower(EmailOtpCode.email) == email,
            EmailOtpCode.purpose == purpose,
            EmailOtpCode.consumed_at.is_(None),
            EmailOtpCode.expires_at >= now,
        )
        .order_by(EmailOtpCode.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Код не найден или истёк. Запросите новый.",
        )
    if row.attempts >= row.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Слишком много попыток. Запросите новый код.",
        )

    if not hmac.compare_digest(row.code_hash, _hash_code(code, settings)):
        row.attempts += 1
        await session.commit()
        left = max(0, row.max_attempts - row.attempts)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Неверный код. Осталось попыток: {left}",
        )

    row.consumed_at = now
    await session.execute(
        update(EmailOtpCode)
        .where(
            func.lower(EmailOtpCode.email) == email,
            EmailOtpCode.purpose == purpose,
            EmailOtpCode.consumed_at.is_(None),
            EmailOtpCode.id != row.id,
        )
        .values(consumed_at=now)
    )
    return row


async def verify_login_code(
    session: AsyncSession,
    *,
    email_raw: str,
    code_raw: str,
    settings: Settings,
) -> tuple[User, str]:
    """Verify login OTP, upsert/find user by auth_email, return (user, jwt)."""
    email = normalize_email(email_raw)
    code = re.sub(r"\s+", "", (code_raw or "").strip())
    if not code.isdigit() or not (4 <= len(code) <= 8):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректный код",
        )

    await _load_valid_otp(
        session,
        email=email,
        code=code,
        purpose="login",
        settings=settings,
    )

    user = await session.scalar(
        select(User).where(
            func.lower(User.auth_email) == email,
            User.is_deleted.is_(False),
        )
    )
    if user is None:
        # New browser-only account. Telegram users should link email in Profile first.
        user = User(
            telegram_id=None,
            username=email.split("@", 1)[0][:64] or None,
            auth_email=email,
        )
        session.add(user)
    else:
        user.auth_email = email

    await session.commit()
    await session.refresh(user)

    token = create_access_token(
        subject=str(user.id),
        telegram_id=user.telegram_id,
        settings=settings,
        extra_claims={"auth": "email"},
    )
    logger.info("auth_ok_email user_id={} email={}", user.id, email)
    return user, token


async def verify_link_code(
    session: AsyncSession,
    *,
    user: User,
    email_raw: str,
    code_raw: str,
    settings: Settings,
) -> User:
    """Verify link OTP and attach email to the current authenticated user."""
    email = normalize_email(email_raw)
    code = re.sub(r"\s+", "", (code_raw or "").strip())
    if not code.isdigit() or not (4 <= len(code) <= 8):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректный код",
        )

    row = await _load_valid_otp(
        session,
        email=email,
        code=code,
        purpose="link",
        settings=settings,
    )
    if row.user_id is not None and row.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Код выписан для другого аккаунта. Запросите новый.",
        )

    owner = await session.scalar(
        select(User).where(
            func.lower(User.auth_email) == email,
            User.is_deleted.is_(False),
        )
    )
    if owner is not None and owner.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Эта почта уже привязана к другому аккаунту",
        )

    user.auth_email = email
    await session.commit()
    await session.refresh(user)
    logger.info("auth_email_linked user_id={} email={}", user.id, email)
    return user
