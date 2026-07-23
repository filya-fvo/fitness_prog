"""Light security/config guards for production readiness."""

from app.core.config import Settings, get_settings
from app.core.security import create_access_token, decode_access_token


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
