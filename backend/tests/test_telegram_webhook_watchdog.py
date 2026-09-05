"""Regression coverage for automatic Telegram webhook recovery."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import Settings
from app.services import telegram_webhook_watchdog as watchdog


def production_settings() -> Settings:
    return Settings(
        bot_token="123456:test-token",
        api_domain="api.filfitclub.ru",
        telegram_webhook_secret="test-webhook-secret",
        jwt_secret="test-secret",
    )


def test_expected_webhook_url_uses_api_domain() -> None:
    assert (
        watchdog.expected_webhook_url(production_settings())
        == "https://api.filfitclub.ru/telegram/webhook"
    )
    assert watchdog.expected_webhook_url(Settings(api_domain="http://unsafe.test")) == ""


def test_recent_timeout_with_pending_updates_requires_repair() -> None:
    now = datetime(2026, 9, 5, 13, 30, tzinfo=UTC)
    info = {
        "url": "https://api.filfitclub.ru/telegram/webhook",
        "pending_update_count": 4,
        "last_error_date": int((now - timedelta(seconds=30)).timestamp()),
        "last_error_message": "Connection timed out",
    }
    assert (
        watchdog.repair_reason(
            info,
            expected_url="https://api.filfitclub.ru/telegram/webhook",
            now=now,
        )
        == "recent_delivery_error"
    )
    info["pending_update_count"] = 0
    assert (
        watchdog.repair_reason(
            info,
            expected_url="https://api.filfitclub.ru/telegram/webhook",
            now=now,
        )
        is None
    )


@pytest.mark.asyncio
async def test_watchdog_reregisters_without_dropping_updates(monkeypatch) -> None:
    now = datetime(2026, 9, 5, 13, 30, tzinfo=UTC)
    calls: list[dict] = []

    async def fake_info(_settings):
        return {
            "result": {
                "url": "https://api.filfitclub.ru/telegram/webhook",
                "pending_update_count": 2,
                "last_error_date": int((now - timedelta(seconds=10)).timestamp()),
                "last_error_message": "Connection timed out",
            }
        }

    async def fake_set(_settings, **kwargs):
        calls.append(kwargs)
        return {"ok": True}

    monkeypatch.setattr(watchdog, "get_webhook_info", fake_info)
    monkeypatch.setattr(watchdog, "set_webhook", fake_set)

    result = await watchdog.repair_telegram_webhook(production_settings(), now=now)

    assert result == {
        "ok": True,
        "repaired": True,
        "reason": "recent_delivery_error",
        "pending_updates": 2,
    }
    assert calls == [
        {
            "webhook_url": "https://api.filfitclub.ru/telegram/webhook",
            "drop_pending": False,
        }
    ]


@pytest.mark.asyncio
async def test_watchdog_leaves_healthy_webhook_unchanged(monkeypatch) -> None:
    async def fake_info(_settings):
        return {
            "result": {
                "url": "https://api.filfitclub.ru/telegram/webhook",
                "pending_update_count": 0,
            }
        }

    async def unexpected_set(*_args, **_kwargs):
        raise AssertionError("healthy webhook must not be re-registered")

    monkeypatch.setattr(watchdog, "get_webhook_info", fake_info)
    monkeypatch.setattr(watchdog, "set_webhook", unexpected_set)

    result = await watchdog.repair_telegram_webhook(production_settings())
    assert result == {"ok": True, "repaired": False, "pending_updates": 0}
