"""Fail fast on unsafe or incomplete Timeweb production settings."""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from urllib.parse import urlsplit


APP_URL = "https://app.filfitclub.ru"
WEBHOOK_SECRET_RE = re.compile(r"^[A-Za-z0-9_-]{16,256}$")


def validation_errors(values: Mapping[str, str]) -> list[str]:
    errors: list[str] = []

    def value(name: str) -> str:
        return str(values.get(name, "")).strip()

    def required_secret(name: str, minimum: int = 1) -> None:
        secret = value(name)
        if len(secret) < minimum or "CHANGE_ME" in secret or secret.startswith("replace_with"):
            errors.append(f"{name} is missing or still contains a placeholder")

    if value("ENVIRONMENT").lower() != "production":
        errors.append("ENVIRONMENT must be production")
    if value("MINI_APP_URL").rstrip("/") != APP_URL:
        errors.append(f"MINI_APP_URL must be {APP_URL}")
    if APP_URL not in {item.strip().rstrip("/") for item in value("CORS_ORIGINS").split(",")}:
        errors.append(f"CORS_ORIGINS must include {APP_URL}")
    if value("EMAIL_OTP_DEV_RETURN_CODE").lower() not in {"false", "0", "no"}:
        errors.append("EMAIL_OTP_DEV_RETURN_CODE must be false in production")

    for name, schemes in (
        ("DATABASE_URL", {"postgresql+asyncpg"}),
        ("REDIS_URL", {"redis", "rediss"}),
    ):
        raw = value(name)
        try:
            parsed = urlsplit(raw)
        except ValueError:
            parsed = None
        if parsed is None or parsed.scheme not in schemes or not parsed.hostname:
            errors.append(f"{name} has an invalid service URL")
        elif parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}:
            errors.append(f"{name} must point to Timeweb DBaaS, not localhost")

    required_secret("BOT_TOKEN", 20)
    required_secret("JWT_SECRET", 32)
    required_secret("TELEGRAM_WEBHOOK_SECRET", 16)
    webhook_secret = value("TELEGRAM_WEBHOOK_SECRET")
    if webhook_secret and not WEBHOOK_SECRET_RE.fullmatch(webhook_secret):
        errors.append("TELEGRAM_WEBHOOK_SECRET may contain only A-Z, a-z, 0-9, _ and -")
    return errors


def main() -> None:
    errors = validation_errors(os.environ)
    if errors:
        print("[timeweb] unsafe production configuration:")
        for error in errors:
            print(f"  - {error}")
        raise SystemExit(2)
    print("[timeweb] production environment validated")


if __name__ == "__main__":
    main()

