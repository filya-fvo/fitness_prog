"""Fail fast on unsafe or incomplete Timeweb production settings."""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from urllib.parse import parse_qs, urlsplit


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

    database_url = value("DATABASE_URL")
    try:
        parsed_database = urlsplit(database_url)
    except ValueError:
        parsed_database = None
    if (
        parsed_database is None
        or parsed_database.scheme != "postgresql+asyncpg"
        or not parsed_database.hostname
    ):
        errors.append("DATABASE_URL has an invalid service URL")
    elif parsed_database.hostname.lower() in {"localhost", "127.0.0.1", "::1"}:
        errors.append("DATABASE_URL must point to Timeweb DBaaS, not localhost")
    else:
        ssl_values = parse_qs(parsed_database.query).get("ssl", [])
        sslmode_values = parse_qs(parsed_database.query).get("sslmode", [])
        if "require" not in {item.lower() for item in [*ssl_values, *sslmode_values]}:
            errors.append("DATABASE_URL must require TLS with ?ssl=require")

    redis_url = value("REDIS_URL")
    try:
        parsed_redis = urlsplit(redis_url)
    except ValueError:
        parsed_redis = None
    if parsed_redis is None or parsed_redis.scheme != "rediss" or not parsed_redis.hostname:
        errors.append("REDIS_URL must use the protected rediss:// Timeweb Valkey URL")
    elif parsed_redis.hostname.lower() in {"localhost", "127.0.0.1", "::1"}:
        errors.append("REDIS_URL must point to Timeweb Valkey, not localhost")

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
