"""Tests for the managed Timeweb App Platform deployment helpers."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _load_script(name: str):
    path = ROOT / "backend" / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_timeweb_environment_rejects_local_or_unprotected_services() -> None:
    module = _load_script("validate_timeweb_env.py")
    errors = module.validation_errors(
        {
            "ENVIRONMENT": "production",
            "MINI_APP_URL": "https://app.filfitclub.ru",
            "CORS_ORIGINS": "https://app.filfitclub.ru",
            "EMAIL_OTP_DEV_RETURN_CODE": "false",
            "DATABASE_URL": "postgresql+asyncpg://fitness:test@127.0.0.1:5432/fitness",
            "REDIS_URL": "redis://valkey.example:6379/0",
            "BOT_TOKEN": "CHANGE_ME",
            "JWT_SECRET": "short",
            "TELEGRAM_WEBHOOK_SECRET": "not valid secret!",
        }
    )
    assert any("DATABASE_URL" in error for error in errors)
    assert any("REDIS_URL" in error for error in errors)
    assert any("BOT_TOKEN" in error for error in errors)
    assert any("JWT_SECRET" in error for error in errors)
    assert any("TELEGRAM_WEBHOOK_SECRET" in error for error in errors)


def test_timeweb_environment_requires_postgres_tls() -> None:
    module = _load_script("validate_timeweb_env.py")
    values = {
        "ENVIRONMENT": "production",
        "MINI_APP_URL": "https://app.filfitclub.ru",
        "CORS_ORIGINS": "https://web.telegram.org,https://app.filfitclub.ru",
        "EMAIL_OTP_DEV_RETURN_CODE": "false",
        "DATABASE_URL": "postgresql+asyncpg://fitness:test@postgres.example:5432/fitness",
        "REDIS_URL": "rediss://default:test@valkey.example:6380/0",
        "BOT_TOKEN": "123456789:abcdefghijklmnopqrstuvwxyz",
        "JWT_SECRET": "j" * 48,
        "TELEGRAM_WEBHOOK_SECRET": "telegram_webhook_secret_123456",
    }
    errors = module.validation_errors(values)
    assert errors == ["DATABASE_URL must require TLS with ?ssl=require"]


def test_timeweb_environment_accepts_managed_public_services() -> None:
    module = _load_script("validate_timeweb_env.py")
    errors = module.validation_errors(
        {
            "ENVIRONMENT": "production",
            "MINI_APP_URL": "https://app.filfitclub.ru",
            "CORS_ORIGINS": "https://web.telegram.org,https://app.filfitclub.ru",
            "EMAIL_OTP_DEV_RETURN_CODE": "false",
            "DATABASE_URL": (
                "postgresql+asyncpg://fitness:encoded%40password@postgres.example:5432/fitness"
                "?ssl=require"
            ),
            "REDIS_URL": "rediss://default:encoded%40password@valkey.example:6380/0",
            "BOT_TOKEN": "123456789:abcdefghijklmnopqrstuvwxyz",
            "JWT_SECRET": "j" * 48,
            "TELEGRAM_WEBHOOK_SECRET": "telegram_webhook_secret_123456",
        }
    )
    assert errors == []


def test_timeweb_migration_environment_does_not_put_password_in_command() -> None:
    module = _load_script("apply_migrations_timeweb.py")
    env = module.postgres_environment(
        "postgresql+asyncpg://fitness:p%40ss@postgres.example:6543/fitness?ssl=require"
    )
    assert env["PGHOST"] == "postgres.example"
    assert env["PGPORT"] == "6543"
    assert env["PGDATABASE"] == "fitness"
    assert env["PGUSER"] == "fitness"
    assert env["PGPASSWORD"] == "p@ss"
    assert env["PGSSLMODE"] == "require"


def test_timeweb_image_combines_spa_api_and_worker_without_secrets() -> None:
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    start = (ROOT / "deploy" / "timeweb" / "start.sh").read_text(encoding="utf-8")
    runner = (ROOT / "deploy" / "timeweb" / "run_api_and_worker.py").read_text(
        encoding="utf-8"
    )
    env_example = (ROOT / "deploy" / "timeweb" / "timeweb.env.example").read_text(
        encoding="utf-8"
    )

    assert "COPY --from=frontend-build /build/frontend/dist ./frontend/dist" in dockerfile
    assert 'ENV VITE_API_URL=""' in dockerfile
    assert "apply_migrations_timeweb.py" in start
    assert "validate_timeweb_env.py" in start
    assert "seed_prod_content.py" in start
    assert "app.main:app" in runner
    assert "app.tasks.notifications.WorkerSettings" in runner
    assert "BOT_TOKEN=CHANGE_ME" in env_example
    assert "cloudflare" not in env_example.lower()
    assert "eyJ" not in env_example


def test_ci_builds_the_timeweb_image_from_the_repository_root() -> None:
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "docker build -t fitness-timeweb:ci ." in workflow


def test_compose_uses_outbound_telegram_poller() -> None:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "telegram-poller:" in compose
    assert 'command: ["python", "-m", "app.telegram_poller"]' in compose
    assert compose.count("TELEGRAM_UPDATE_MODE: polling") == 3
    poller_block = compose.split("  telegram-poller:", 1)[1].split("\n  web:", 1)[0]
    assert "- ipv6_egress" in poller_block
    assert "- default" in poller_block
