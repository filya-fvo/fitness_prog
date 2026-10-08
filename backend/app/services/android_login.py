"""One-use native Telegram login. Conditional SQL owns all state transitions."""

from __future__ import annotations
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select, text, update
from app.core.security import TelegramUser
from app.models.android_login import AndroidLogin

TTL_SECONDS = 300


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def unavailable():
    return HTTPException(410, "Время входа истекло. Начните заново.")


def pending():
    return (
        AndroidLogin.expires_at > datetime.now(timezone.utc),
        AndroidLogin.consumed_at.is_(None),
    )


async def cleanup_login(session):
    await session.execute(
        delete(AndroidLogin)
        .where(AndroidLogin.expires_at <= datetime.now(timezone.utc))
        .execution_options(synchronize_session=False)
    )
    await session.commit()


async def start_login(session, challenge: str, bot_username: str, source_hash: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{64}", challenge):
        raise HTTPException(422, "Не удалось начать вход")
    if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", bot_username):
        raise HTTPException(503, "Вход через Telegram пока не настроен")
    now = datetime.now(timezone.utc)
    await session.execute(
        delete(AndroidLogin)
        .where(AndroidLogin.expires_at <= now)
        .execution_options(synchronize_session=False)
    )
    # Serialize admission for a source on PostgreSQL, preventing burst races.
    if session.get_bind().dialect.name == "postgresql":
        lock = int(source_hash[:16], 16) & ((1 << 63) - 1)
        await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock})
    count = (
        await session.execute(
            select(func.count())
            .select_from(AndroidLogin)
            .where(
                AndroidLogin.source_hash == source_hash,
                AndroidLogin.created_at > now - timedelta(minutes=1),
            )
        )
    ).scalar_one()
    if count >= 5:
        await session.rollback()
        raise HTTPException(429, "Слишком много попыток. Подождите минуту.")
    token = secrets.token_urlsafe(32)
    row = AndroidLogin(
        id=uuid.uuid4(),
        link_hash=digest(token),
        challenge=challenge,
        source_hash=source_hash,
        created_at=now,
        expires_at=now + timedelta(seconds=TTL_SECONDS),
    )
    session.add(row)
    await session.commit()
    return {
        "request_id": row.id,
        "bot_url": f"https://t.me/{bot_username}?start=android_login_{token}",
        "expires_in_sec": TTL_SECONDS,
    }


async def claim_login(session, token: str, actor: dict) -> bool:
    identity = {
        key: actor.get(key)
        for key in ("id", "username", "first_name", "last_name", "language_code")
    }
    result = await session.execute(
        update(AndroidLogin)
        .where(
            AndroidLogin.link_hash == digest(token),
            *pending(),
            AndroidLogin.approved_at.is_(None),
            or_(AndroidLogin.telegram_id.is_(None), AndroidLogin.telegram_id == identity["id"]),
        )
        .values(telegram_id=identity["id"], actor=identity)
        .returning(AndroidLogin.id)
    )
    found = result.scalar_one_or_none() is not None
    await session.commit()
    return found


async def approve_login(session, token: str, actor_id: int) -> bool:
    result = await session.execute(
        update(AndroidLogin)
        .where(
            AndroidLogin.link_hash == digest(token),
            *pending(),
            AndroidLogin.telegram_id == actor_id,
        )
        .values(approved_at=datetime.now(timezone.utc))
        .returning(AndroidLogin.id)
    )
    found = result.scalar_one_or_none() is not None
    await session.commit()
    return found


def proof(request_id, verifier):
    if not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", verifier):
        raise unavailable()
    return (AndroidLogin.id == request_id, AndroidLogin.challenge == digest(verifier), *pending())


async def login_status(session, request_id: uuid.UUID, verifier: str) -> dict:
    row = (
        await session.execute(select(AndroidLogin).where(*proof(request_id, verifier)))
    ).scalar_one_or_none()
    if row is None:
        raise unavailable()
    if row.approved_at is None:
        return {"state": "waiting"}
    actor = row.actor or {}
    name = actor.get("first_name") or "Пользователь Telegram"
    if actor.get("username"):
        name += f" (@{actor['username']})"
    return {"state": "ready", "display_name": name}


async def consume_login(session, request_id: uuid.UUID, verifier: str) -> TelegramUser:
    result = await session.execute(
        update(AndroidLogin)
        .where(*proof(request_id, verifier), AndroidLogin.approved_at.is_not(None))
        .values(consumed_at=datetime.now(timezone.utc))
        .returning(AndroidLogin.actor)
    )
    actor = result.scalar_one_or_none()
    await session.commit()
    if actor is None:
        raise unavailable()
    return TelegramUser(**actor)


async def cancel_login(session, request_id: uuid.UUID, verifier: str) -> None:
    await session.execute(
        update(AndroidLogin)
        .where(*proof(request_id, verifier))
        .values(consumed_at=datetime.now(timezone.utc))
    )
    await session.commit()
