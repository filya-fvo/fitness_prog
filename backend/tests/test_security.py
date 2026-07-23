"""Unit tests for initData validation and JWT (TZ §8, §11)."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from jose import jwt

from app.core.config import Settings
from app.core.security import (
    InitDataError,
    create_access_token,
    decode_access_token,
    validate_init_data,
)


def _make_init_data(bot_token: str, user: dict, *, auth_date: int | None = None) -> str:
    """Build a valid Telegram initData query string for tests."""
    payload = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": "AAEAAAE",
        "user": json.dumps(user, separators=(",", ":")),
    }
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(payload.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    return urlencode(payload)


BOT_TOKEN = "123456:ABC-DEF_test_bot_token"


def test_validate_init_data_success() -> None:
    init_data = _make_init_data(
        BOT_TOKEN,
        {"id": 42, "username": "athlete", "first_name": "Ivan"},
    )
    result = validate_init_data(init_data, BOT_TOKEN)
    assert result.user.id == 42
    assert result.user.username == "athlete"


def test_validate_init_data_rejects_bad_hash() -> None:
    init_data = _make_init_data(BOT_TOKEN, {"id": 1, "first_name": "A"})
    tampered = init_data.replace("hash=", "hash=deadbeef")
    # Ensure we actually changed something meaningful
    if tampered == init_data:
        tampered = init_data + "x"
    with pytest.raises(InitDataError, match="signature|invalid|hash"):
        validate_init_data(tampered, BOT_TOKEN)


def test_validate_init_data_rejects_expired() -> None:
    old = int(time.time()) - 100_000
    init_data = _make_init_data(BOT_TOKEN, {"id": 7, "first_name": "Old"}, auth_date=old)
    with pytest.raises(InitDataError, match="expired"):
        validate_init_data(init_data, BOT_TOKEN, max_age_seconds=86400)


def test_create_and_decode_jwt() -> None:
    settings = Settings(
        bot_token=BOT_TOKEN,
        jwt_secret="unit-test-secret-key-32chars-min",
        jwt_expire_days=30,
    )
    token = create_access_token(subject="user-uuid", telegram_id=99, settings=settings)
    payload = decode_access_token(token, settings=settings)
    assert payload["sub"] == "user-uuid"
    assert payload["telegram_id"] == 99
    # jose may return exp as int
    assert "exp" in payload
    decoded = jwt.get_unverified_claims(token)
    assert decoded["sub"] == "user-uuid"
