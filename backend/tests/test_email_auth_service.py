"""Unit tests for email OTP helpers (no DB/SMTP)."""

from app.core.config import Settings
from app.services.email_auth_service import _generate_code, _hash_code, normalize_email
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
