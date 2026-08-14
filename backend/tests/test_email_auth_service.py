"""Unit tests for email OTP helpers (no DB/SMTP)."""

import uuid

from app.core.config import Settings
from app.services import email_auth_service
from app.services.email_auth_service import (
    _generate_code,
    _hash_code,
    _issue_otp,
    normalize_email,
    request_login_code,
    verify_link_code,
    verify_login_code,
)
from fastapi import HTTPException
import pytest


def test_normalize_email_ok() -> None:
    assert normalize_email("  User@Mail.RU ") == "user@mail.ru"


def test_normalize_email_bad() -> None:
    with pytest.raises(HTTPException) as ei:
        normalize_email("not-an-email")
    assert ei.value.status_code == 422


def test_hash_stable() -> None:
    s = Settings(jwt_secret="test-secret-for-otp-hashing-only")
    a = _hash_code("123456", s)
    b = _hash_code("123456", s)
    c = _hash_code("000000", s)
    assert a == b
    assert a != c
    assert len(a) == 64


def test_generate_code_length() -> None:
    code = _generate_code(6)
    assert len(code) == 6
    assert code.isdigit()


class FakeSession:
    def __init__(self, scalar_values=None) -> None:
        self.scalar_values = list(scalar_values or [])
        self.added = []
        self.deleted = []
        self.commits = 0

    async def execute(self, *_args, **_kwargs):
        return None

    async def scalar(self, *_args, **_kwargs):
        return self.scalar_values.pop(0) if self.scalar_values else None

    def add(self, row) -> None:
        self.added.append(row)

    async def delete(self, row) -> None:
        self.deleted.append(row)

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _row) -> None:
        return None

    async def rollback(self) -> None:
        return None


@pytest.mark.asyncio
async def test_unknown_email_can_request_registration_code(monkeypatch) -> None:
    session = FakeSession()
    captured = {}

    async def issue(*_args, **kwargs):
        captured.update(kwargs)
        return {"ok": True, "email": kwargs["email"]}

    monkeypatch.setattr(email_auth_service, "_issue_otp", issue)
    result = await request_login_code(
        session,  # type: ignore[arg-type]
        email_raw="unknown@example.test",
        settings=Settings(jwt_secret="test-secret"),
    )
    assert result["ok"] is True
    assert captured["email"] == "unknown@example.test"
    assert captured["purpose"] == "login"


@pytest.mark.asyncio
async def test_verify_creates_browser_only_account_after_valid_otp(monkeypatch) -> None:
    session = FakeSession([None])

    async def valid_otp(*_args, **_kwargs):
        return object()

    monkeypatch.setattr(email_auth_service, "_load_valid_otp", valid_otp)
    user, token = await verify_login_code(
        session,  # type: ignore[arg-type]
        email_raw="unknown@example.test",
        code_raw="123456",
        settings=Settings(jwt_secret="test-secret"),
    )
    assert user.auth_email == "unknown@example.test"
    assert user.telegram_id is None
    assert session.added == [user]
    assert token


@pytest.mark.asyncio
async def test_production_smtp_failure_is_not_reported_as_success(monkeypatch) -> None:
    session = FakeSession([None])

    async def failed_send(**_kwargs) -> bool:
        return False

    monkeypatch.setattr(email_auth_service, "send_login_otp_email", failed_send)
    with pytest.raises(HTTPException) as exc:
        await _issue_otp(
            session,  # type: ignore[arg-type]
            email="linked@example.test",
            purpose="login",
            settings=Settings(environment="production", jwt_secret="test-secret"),
        )
    assert exc.value.status_code == 503
    assert len(session.deleted) == 1
    assert session.commits == 2


@pytest.mark.asyncio
async def test_link_existing_email_requires_explicit_merge_choice(monkeypatch) -> None:
    telegram_user = email_auth_service.User(telegram_id=123, anthropometry={}, goals={})
    email_user = email_auth_service.User(
        auth_email="same@example.test",
        anthropometry={"weight_kg": 80},
        goals={},
    )
    telegram_user.id = uuid.uuid4()
    email_user.id = uuid.uuid4()
    session = FakeSession([email_user])

    async def valid_otp(*_args, **_kwargs):
        return type("Otp", (), {"user_id": telegram_user.id})()

    async def preview(*_args, **_kwargs):
        return {"conflicts": ["Данные тела и замеры"], "email": {}, "telegram": {}}

    monkeypatch.setattr(email_auth_service, "_load_valid_otp", valid_otp)
    monkeypatch.setattr(email_auth_service, "merge_preview", preview)

    result = await verify_link_code(
        session,  # type: ignore[arg-type]
        user=telegram_user,
        email_raw="same@example.test",
        code_raw="123456",
        settings=Settings(jwt_secret="test-secret"),
    )

    assert result.merge_required is True
    assert result.user is None
    assert result.preview and result.preview["conflicts"]
