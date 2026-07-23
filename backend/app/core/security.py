"""Telegram initData validation (HMAC-SHA256) and JWT helpers.

TZ §8: validate initData with bot token, issue session JWT (30 days).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl

from jose import JWTError, jwt

from app.core.config import Settings, get_settings


class InitDataError(ValueError):
    """Raised when Telegram initData is missing, expired, or forged."""


@dataclass(frozen=True, slots=True)
class TelegramUser:
    """Subset of Telegram WebApp user fields used by auth."""

    id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    language_code: str | None = None


@dataclass(frozen=True, slots=True)
class ValidatedInitData:
    """Parsed and signature-verified initData payload."""

    user: TelegramUser
    auth_date: int
    query_id: str | None = None
    raw: dict[str, str] | None = None


def _build_data_check_string(fields: dict[str, str]) -> str:
    """Build Telegram data-check-string from initData fields (without hash)."""
    pairs = [f"{key}={value}" for key, value in sorted(fields.items()) if key != "hash"]
    return "\n".join(pairs)


def _secret_key(bot_token: str) -> bytes:
    """Derive WebApp secret key: HMAC_SHA256(key='WebAppData', msg=bot_token)."""
    return hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()


def validate_init_data(
    init_data: str,
    bot_token: str,
    *,
    max_age_seconds: int | None = 86400,
    now: int | None = None,
) -> ValidatedInitData:
    """Validate Telegram Mini App initData signature and parse user.

    Algorithm (Telegram Web Apps docs):
    1. Parse query-string pairs
    2. Remove hash, sort remaining key=value by key, join with \\n
    3. secret_key = HMAC_SHA256("WebAppData", bot_token)
    4. hex(HMAC_SHA256(secret_key, data_check_string)) must equal hash
    """
    if not init_data or not init_data.strip():
        raise InitDataError("initData is empty")
    if not bot_token or bot_token.startswith("replace_with_"):
        raise InitDataError("BOT_TOKEN is not configured")

    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = fields.get("hash")
    if not received_hash:
        raise InitDataError("initData hash is missing")

    data_check_string = _build_data_check_string(fields)
    calculated_hash = hmac.new(
        _secret_key(bot_token),
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise InitDataError("initData signature is invalid")

    auth_date_raw = fields.get("auth_date")
    if not auth_date_raw:
        raise InitDataError("auth_date is missing")
    try:
        auth_date = int(auth_date_raw)
    except ValueError as exc:
        raise InitDataError("auth_date is invalid") from exc

    current_ts = int(time.time() if now is None else now)
    if max_age_seconds is not None and current_ts - auth_date > max_age_seconds:
        raise InitDataError("initData is expired")

    user_raw = fields.get("user")
    if not user_raw:
        raise InitDataError("user is missing in initData")
    try:
        user_data = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise InitDataError("user JSON is invalid") from exc

    telegram_id = user_data.get("id")
    if not isinstance(telegram_id, int):
        raise InitDataError("user.id is missing or invalid")

    user = TelegramUser(
        id=telegram_id,
        username=user_data.get("username"),
        first_name=user_data.get("first_name"),
        last_name=user_data.get("last_name"),
        language_code=user_data.get("language_code"),
    )
    return ValidatedInitData(
        user=user,
        auth_date=auth_date,
        query_id=fields.get("query_id"),
        raw=fields,
    )


def create_access_token(
    *,
    subject: str,
    telegram_id: int,
    settings: Settings | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create HS256 JWT session token (default TTL: 30 days per TZ §8)."""
    cfg = settings or get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "telegram_id": telegram_id,
        "iat": now,
        "exp": now + timedelta(days=cfg.jwt_expire_days),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, cfg.jwt_secret, algorithm=cfg.jwt_algorithm)


def decode_access_token(token: str, settings: Settings | None = None) -> dict[str, Any]:
    """Decode and verify JWT. Raises JWTError on failure."""
    cfg = settings or get_settings()
    return jwt.decode(token, cfg.jwt_secret, algorithms=[cfg.jwt_algorithm])


def get_token_subject(token: str, settings: Settings | None = None) -> str:
    """Return JWT subject (user id) or raise JWTError/ValueError."""
    payload = decode_access_token(token, settings=settings)
    subject = payload.get("sub")
    if not subject:
        raise JWTError("token subject is missing")
    return str(subject)
