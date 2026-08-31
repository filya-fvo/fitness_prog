"""Telegram OIDC login for the regular browser application."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any

import httpx
from jose import JWTError, jwt

from app.core.config import Settings
from app.core.security import TelegramUser

TELEGRAM_ISSUER = "https://oauth.telegram.org"
TELEGRAM_JWKS_URL = f"{TELEGRAM_ISSUER}/.well-known/jwks.json"
NONCE_MAX_AGE_SECONDS = 300
JWKS_MAX_BYTES = 64 * 1024
JWKS_CACHE_SECONDS = 3600


class TelegramBrowserAuthError(ValueError):
    """The Telegram browser credential is invalid or cannot be trusted."""


class TelegramBrowserAuthUnavailable(RuntimeError):
    """Telegram Login is not configured or its verification keys are unavailable."""


class _SigningKeyNotFound(TelegramBrowserAuthError):
    """The cached Telegram JWKS does not contain the token's current key."""


@dataclass(slots=True)
class _JwksCache:
    value: dict[str, Any] | None = None
    expires_at: float = 0.0
    fetched_at: float = 0.0


_jwks_cache = _JwksCache()


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def create_login_nonce(settings: Settings, *, now: int | None = None) -> str:
    """Create a short-lived nonce that can be verified without server-side state."""
    issued_at = int(time.time() if now is None else now)
    payload = f"{_base64url(secrets.token_bytes(24))}.{issued_at}"
    signature = hmac.new(
        settings.jwt_secret.encode("utf-8"),
        f"telegram-login:{payload}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{payload}.{_base64url(signature)}"


def validate_login_nonce(nonce: str, settings: Settings, *, now: int | None = None) -> None:
    """Validate nonce signature and its narrow login window."""
    try:
        random_part, issued_raw, received_signature = nonce.split(".", maxsplit=2)
        issued_at = int(issued_raw)
    except (TypeError, ValueError) as exc:
        raise TelegramBrowserAuthError("login nonce is invalid") from exc
    payload = f"{random_part}.{issued_raw}"
    expected_signature = _base64url(
        hmac.new(
            settings.jwt_secret.encode("utf-8"),
            f"telegram-login:{payload}".encode("utf-8"),
            hashlib.sha256,
        ).digest()
    )
    if not hmac.compare_digest(expected_signature, received_signature):
        raise TelegramBrowserAuthError("login nonce signature is invalid")
    current_ts = int(time.time() if now is None else now)
    age = current_ts - issued_at
    if age < -60 or age > NONCE_MAX_AGE_SECONDS:
        raise TelegramBrowserAuthError("login nonce is expired")


def _validate_jwks_payload(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise TelegramBrowserAuthUnavailable("Telegram JWKS response is invalid")
    keys = payload.get("keys")
    if not isinstance(keys, list) or not keys or len(keys) > 20:
        raise TelegramBrowserAuthUnavailable("Telegram JWKS keys are invalid")
    if not all(isinstance(key, dict) for key in keys):
        raise TelegramBrowserAuthUnavailable("Telegram JWKS key is invalid")
    return payload


async def _fetch_telegram_jwks(*, force_refresh: bool = False) -> dict[str, Any]:
    now = time.monotonic()
    if _jwks_cache.value is not None and _jwks_cache.expires_at > now:
        if not force_refresh or now - _jwks_cache.fetched_at < 60:
            return _jwks_cache.value
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
            async with client.stream(
                "GET",
                TELEGRAM_JWKS_URL,
                headers={"Accept": "application/json"},
            ) as response:
                response.raise_for_status()
                media_type = response.headers.get("Content-Type", "").partition(";")[0].lower()
                if media_type not in {"application/json", "application/jwk-set+json"}:
                    raise TelegramBrowserAuthUnavailable("Telegram JWKS response type is invalid")
                try:
                    declared_size = int(response.headers.get("Content-Length", "0") or 0)
                except ValueError as exc:
                    raise TelegramBrowserAuthUnavailable(
                        "Telegram JWKS response size is invalid"
                    ) from exc
                if declared_size > JWKS_MAX_BYTES:
                    raise TelegramBrowserAuthUnavailable("Telegram JWKS response is too large")
                chunks: list[bytes] = []
                received = 0
                async for chunk in response.aiter_bytes():
                    received += len(chunk)
                    if received > JWKS_MAX_BYTES:
                        raise TelegramBrowserAuthUnavailable("Telegram JWKS response is too large")
                    chunks.append(chunk)
    except httpx.HTTPError as exc:
        raise TelegramBrowserAuthUnavailable("Telegram verification keys are unavailable") from exc
    try:
        payload = json.loads(b"".join(chunks))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise TelegramBrowserAuthUnavailable("Telegram JWKS response is invalid") from exc
    validated = _validate_jwks_payload(payload)
    _jwks_cache.value = validated
    _jwks_cache.expires_at = now + JWKS_CACHE_SECONDS
    _jwks_cache.fetched_at = now
    return validated


def _select_signing_key(id_token: str, jwks: dict[str, Any]) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(id_token)
    except JWTError as exc:
        raise TelegramBrowserAuthError("Telegram id_token header is invalid") from exc
    if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
        raise TelegramBrowserAuthError("Telegram id_token algorithm is not allowed")
    key = next((item for item in jwks["keys"] if item.get("kid") == header["kid"]), None)
    if key is None:
        raise _SigningKeyNotFound("Telegram signing key was not found")
    return key


async def validate_telegram_id_token(
    id_token: str,
    nonce: str,
    settings: Settings,
    *,
    jwks: dict[str, Any] | None = None,
) -> TelegramUser:
    """Verify Telegram's OIDC token and return only trusted profile fields."""
    validate_login_nonce(nonce, settings)
    client_id = settings.effective_telegram_login_client_id
    if client_id is None:
        raise TelegramBrowserAuthUnavailable("Telegram Login is not configured")
    signing_keys = _validate_jwks_payload(jwks) if jwks is not None else await _fetch_telegram_jwks()
    try:
        key = _select_signing_key(id_token, signing_keys)
    except _SigningKeyNotFound:
        if jwks is not None:
            raise
        key = _select_signing_key(
            id_token,
            await _fetch_telegram_jwks(force_refresh=True),
        )
    try:
        claims = jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=TELEGRAM_ISSUER,
            options={"require_exp": True, "require_iat": True},
        )
    except JWTError as exc:
        raise TelegramBrowserAuthError("Telegram id_token is invalid") from exc
    if not hmac.compare_digest(str(claims.get("nonce") or ""), nonce):
        raise TelegramBrowserAuthError("Telegram id_token nonce is invalid")
    telegram_id = claims.get("id")
    if isinstance(telegram_id, str) and telegram_id.isdigit():
        telegram_id = int(telegram_id)
    if not isinstance(telegram_id, int) or telegram_id <= 0:
        raise TelegramBrowserAuthError("Telegram user id is invalid")
    return TelegramUser(
        id=telegram_id,
        username=claims.get("preferred_username") if isinstance(claims.get("preferred_username"), str) else None,
        first_name=claims.get("given_name") if isinstance(claims.get("given_name"), str) else None,
        last_name=claims.get("family_name") if isinstance(claims.get("family_name"), str) else None,
    )
