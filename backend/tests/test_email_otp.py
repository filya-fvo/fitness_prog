"""Unit tests for email OTP hashing / normalization (no DB)."""

from app.core.config import Settings
from app.services.email_otp_service import (
    EmailOtpError,
    generate_otp_code,
    hash_otp_code,
    normalize_email,
)


def test_normalize_email_ok():
    assert normalize_email("  User@Example.COM ") == "user@example.com"


def test_normalize_email_bad():
    try:
        normalize_email("not-an-email")
        assert False, "expected error"
    except EmailOtpError:
        pass


def test_hash_otp_stable_and_peppered():
    s = Settings(jwt_secret="test-secret")
    a = hash_otp_code("123456", s)
    b = hash_otp_code("123456", s)
    c = hash_otp_code("000000", s)
    assert a == b
    assert a != c
    assert len(a) == 64


def test_generate_otp_format():
    code = generate_otp_code()
    assert len(code) == 6
    assert code.isdigit()
