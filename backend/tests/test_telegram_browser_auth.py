"""Telegram OIDC browser login verification and API contract."""

from __future__ import annotations

import base64
import time
import uuid

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.main import app
from app.models.user import User
from app.services.telegram_browser_auth import (
    TELEGRAM_ISSUER,
    TelegramBrowserAuthError,
    create_login_nonce,
    validate_login_nonce,
    validate_telegram_id_token,
)


def _b64int(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _key_pair() -> tuple[bytes, dict[str, object]]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    numbers = private.public_key().public_numbers()
    return private_pem, {
        "kty": "RSA",
        "kid": "telegram-test-key",
        "use": "sig",
        "alg": "RS256",
        "n": _b64int(numbers.n),
        "e": _b64int(numbers.e),
    }


def _settings() -> Settings:
    return Settings(
        bot_token="123456:test-token",
        telegram_login_client_id="123456",
        jwt_secret="browser-login-test-secret-at-least-32-chars",
    )


def test_login_nonce_is_signed_and_short_lived() -> None:
    settings = _settings()
    nonce = create_login_nonce(settings, now=1_000)
    validate_login_nonce(nonce, settings, now=1_299)
    with pytest.raises(TelegramBrowserAuthError, match="signature"):
        validate_login_nonce(f"{nonce[:-1]}x", settings, now=1_100)
    with pytest.raises(TelegramBrowserAuthError, match="expired"):
        validate_login_nonce(nonce, settings, now=1_301)


async def test_validate_telegram_id_token_checks_signature_audience_and_nonce() -> None:
    settings = _settings()
    nonce = create_login_nonce(settings)
    private_key, public_jwk = _key_pair()
    now = int(time.time())
    claims = {
        "iss": TELEGRAM_ISSUER,
        "aud": "123456",
        "iat": now,
        "exp": now + 300,
        "nonce": nonce,
        "id": 987654321,
        "given_name": "Иван",
        "family_name": "Иванов",
        "preferred_username": "athlete",
    }
    id_token = jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": "telegram-test-key"},
    )
    user = await validate_telegram_id_token(
        id_token,
        nonce,
        settings,
        jwks={"keys": [public_jwk]},
    )
    assert (user.id, user.username, user.first_name) == (987654321, "athlete", "Иван")

    wrong_audience = jwt.encode(
        {**claims, "aud": "999999"},
        private_key,
        algorithm="RS256",
        headers={"kid": "telegram-test-key"},
    )
    with pytest.raises(TelegramBrowserAuthError, match="id_token"):
        await validate_telegram_id_token(
            wrong_audience,
            nonce,
            settings,
            jwks={"keys": [public_jwk]},
        )


async def test_browser_login_config_and_exchange_api(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings()
    user = User(
        telegram_id=987654321,
        username="athlete",
        anthropometry={},
        goals={"onboarding_completed": True},
        subscription_status="free",
        stars_balance=0,
    )
    user.id = uuid.UUID("00000000-0000-4000-8000-000000000123")

    async def fake_db():
        yield object()

    async def fake_authenticate(session, id_token, nonce, auth_settings):
        assert session is not None
        assert (id_token, nonce) == ("signed-id-token-which-is-long-enough", "n" * 40)
        assert auth_settings is settings
        return user, "application-jwt"

    monkeypatch.setattr("app.routers.auth.authenticate_telegram_browser", fake_authenticate)
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: settings
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            config = await client.get("/auth/telegram/browser/config")
            assert config.status_code == 200
            assert config.json()["client_id"] == 123456
            assert len(config.json()["nonce"]) >= 32

            response = await client.post(
                "/auth/telegram/browser",
                json={
                    "id_token": "signed-id-token-which-is-long-enough",
                    "nonce": "n" * 40,
                },
            )
            assert response.status_code == 200
            assert response.json()["access_token"] == "application-jwt"
            assert response.json()["user"]["telegram_id"] == 987654321
    finally:
        app.dependency_overrides.clear()


def test_login_client_id_falls_back_to_bot_id() -> None:
    assert Settings(bot_token="7654321:secret").effective_telegram_login_client_id == "7654321"
    assert Settings(bot_token="replace_with_telegram_bot_token").effective_telegram_login_client_id is None
