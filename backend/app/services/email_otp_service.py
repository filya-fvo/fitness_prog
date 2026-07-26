"""Email OTP: create, hash, verify. Plaintext codes are never stored."""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.email_otp import EmailOtpCode
from app.models.user import User
from app.services.email_delivery import EmailDeliveryError, deliver_otp

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
OTP_TTL_MINUTES = 10
OTP_RESEND_SECONDS = 60
OTP_LENGTH = 6


class EmailOtpError(ValueError):
    """Business-rule error for OTP flow."""


def normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not email or not EMAIL_RE.match(email):
        raise EmailOtpError("Некорректный email")
    if len(email) > 320:
        raise EmailOtpError("Email слишком длинный")
    return email


def hash_otp_code(code: str, settings: Settings) -> str:
    """HMAC-SHA256 so DB leak alone is not enough without jwt_secret pepper."""
    pepper = (settings.jwt_secret or "otp-pepper").encode("utf-8")
    return hmac.new(pepper, code.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_otp_code() -> str:
    # cryptographically strong 6-digit code (000000–999999)
    return f"{secrets.randbelow(1_000_000):06d}"


async def find_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(
        select(User).where(
            func.lower(User.auth_email) == email,
            User.is_deleted.is_(False),
        )
    )
    return result.scalar_one_or_none()


async def _recent_unconsumed(
    session: AsyncSession,
    *,
    email: str,
    purpose: str,
) -> EmailOtpCode | None:
    result = await session.execute(
        select(EmailOtpCode)
        .where(
            func.lower(EmailOtpCode.email) == email,
            EmailOtpCode.purpose == purpose,
            EmailOtpCode.consumed_at.is_(None),
        )
        .order_by(EmailOtpCode.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def request_otp(
    session: AsyncSession,
    settings: Settings,
    *,
    email_raw: str,
    purpose: str,
    user: User | None = None,
    request_ip: str | None = None,
) -> dict:
    """
    Create OTP and deliver it.
    purpose=login — web sign-in (user may or may not exist yet)
    purpose=link  — bind email to current authenticated user
    """
    if purpose not in {"login", "link"}:
        raise EmailOtpError("Неизвестная цель кода")

    email = normalize_email(email_raw)
    now = datetime.now(UTC)

    existing = await find_user_by_email(session, email)

    if purpose == "link":
        if user is None:
            raise EmailOtpError("Нужна авторизация")
        if existing is not None and existing.id != user.id:
            raise EmailOtpError("Этот email уже привязан к другому аккаунту")
        deliver_tg = user.telegram_id
    else:
        # login: prefer Telegram of the account that owns this email
        deliver_tg = existing.telegram_id if existing is not None else None
        user = existing

    recent = await _recent_unconsumed(session, email=email, purpose=purpose)
    if recent is not None:
        created = recent.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        age = (now - created).total_seconds()
        if age < OTP_RESEND_SECONDS:
            wait = int(OTP_RESEND_SECONDS - age)
            raise EmailOtpError(f"Подождите {wait} с. перед повторной отправкой")

    code = generate_otp_code()
    row = EmailOtpCode(
        email=email,
        purpose=purpose,
        code_hash=hash_otp_code(code, settings),
        user_id=user.id if user is not None else None,
        expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
        request_ip=request_ip,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    try:
        channels = await deliver_otp(
            settings,
            email=email,
            code=code,
            purpose=purpose,
            telegram_id=int(deliver_tg) if deliver_tg is not None else None,
        )
    except EmailDeliveryError:
        # Invalidate unused code if delivery failed completely
        row.consumed_at = now
        await session.commit()
        raise

    result: dict = {
        "ok": True,
        "email": email,
        "purpose": purpose,
        "expires_in_sec": OTP_TTL_MINUTES * 60,
        "channels": channels,
        "message": _channel_message(channels),
    }
    # Only expose code in non-production when delivery fell back to logs
    if "dev_log" in channels and settings.environment in {"development", "debug", "test"}:
        result["debug_code"] = code
    return result


def _channel_message(channels: list[str]) -> str:
    parts: list[str] = []
    if "telegram" in channels:
        parts.append("в Telegram")
    if "smtp" in channels:
        parts.append("на email")
    if "dev_log" in channels:
        parts.append("в лог сервера (dev)")
    if not parts:
        return "Код отправлен"
    return "Код отправлен " + " и ".join(parts)


async def verify_otp(
    session: AsyncSession,
    settings: Settings,
    *,
    email_raw: str,
    code_raw: str,
    purpose: str,
    user: User | None = None,
) -> User:
    """Validate OTP. For login returns/creates user; for link binds email and returns user."""
    if purpose not in {"login", "link"}:
        raise EmailOtpError("Неизвестная цель кода")

    email = normalize_email(email_raw)
    code = (code_raw or "").strip().replace(" ", "")
    if not re.fullmatch(r"\d{6}", code):
        raise EmailOtpError("Код должен состоять из 6 цифр")

    now = datetime.now(UTC)
    row = await _recent_unconsumed(session, email=email, purpose=purpose)
    if row is None:
        raise EmailOtpError("Код не найден. Запросите новый")

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < now:
        raise EmailOtpError("Код истёк. Запросите новый")

    if row.attempts >= row.max_attempts:
        raise EmailOtpError("Слишком много попыток. Запросите новый код")

    expected = hash_otp_code(code, settings)
    if not hmac.compare_digest(expected, row.code_hash):
        row.attempts += 1
        await session.commit()
        left = max(0, row.max_attempts - row.attempts)
        raise EmailOtpError(f"Неверный код. Осталось попыток: {left}")

    # success — consume this and any other open codes for same email+purpose
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

    if purpose == "link":
        if user is None:
            raise EmailOtpError("Нужна авторизация")
        other = await find_user_by_email(session, email)
        if other is not None and other.id != user.id:
            raise EmailOtpError("Этот email уже привязан к другому аккаунту")
        user.auth_email = email
        await session.commit()
        await session.refresh(user)
        return user

    # login
    account = await find_user_by_email(session, email)
    if account is None:
        # Web-only account (no Telegram yet)
        account = User(
            telegram_id=None,
            username=None,
            auth_email=email,
        )
        session.add(account)
    else:
        # ensure email normalized
        account.auth_email = email

    await session.commit()
    await session.refresh(account)
    return account
