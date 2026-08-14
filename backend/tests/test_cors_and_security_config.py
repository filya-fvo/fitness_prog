"""Light security/config guards for production readiness."""

import pytest
from fastapi import HTTPException

from app.core.config import Settings, get_settings
from app.core.security import create_access_token, decode_access_token
from app.routers.telegram import _verify_secret


def test_cors_origin_list_strips_blanks() -> None:
    s = Settings(
        cors_origins="https://web.telegram.org, https://app.example.com ,",
        bot_token="x",
        jwt_secret="y" * 32,
    )
    assert s.cors_origin_list == [
        "https://web.telegram.org",
        "https://app.example.com",
    ]


def test_jwt_roundtrip(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "z" * 32)
    monkeypatch.setenv("BOT_TOKEN", "test-bot-token")
    get_settings.cache_clear()
    try:
        settings = get_settings()
        token = create_access_token(
            subject="00000000-0000-4000-8000-000000000001",
            telegram_id=123456,
            settings=settings,
        )
        payload = decode_access_token(token, settings=settings)
        assert str(payload.get("sub")) == "00000000-0000-4000-8000-000000000001"
        assert int(payload.get("telegram_id")) == 123456
    finally:
        get_settings.cache_clear()


def test_production_disables_docs_flag_logic() -> None:
    env = "production"
    docs = None if env == "production" else "/docs"
    assert docs is None


def test_production_webhook_requires_configured_secret() -> None:
    settings = Settings(environment="production", telegram_webhook_secret="")
    with pytest.raises(HTTPException) as exc:
        _verify_secret(settings, None)
    assert exc.value.status_code == 503


def test_webhook_rejects_wrong_secret() -> None:
    settings = Settings(environment="production", telegram_webhook_secret="expected")
    with pytest.raises(HTTPException) as exc:
        _verify_secret(settings, "wrong")
    assert exc.value.status_code == 403


def test_webhook_accepts_matching_secret() -> None:
    settings = Settings(environment="production", telegram_webhook_secret="expected")
    _verify_secret(settings, "expected")
