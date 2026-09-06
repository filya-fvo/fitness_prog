"""Tests for reliable outbound Telegram update ingress."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.core.config import Settings
from app import telegram_poller


def test_update_id_rejects_invalid_values() -> None:
    assert telegram_poller._update_id({"update_id": 42}) == 42
    assert telegram_poller._update_id({"update_id": -1}) is None
    assert telegram_poller._update_id({"update_id": "42"}) is None


@pytest.mark.asyncio
async def test_dispatch_uses_private_api_and_secret_header() -> None:
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["secret"] = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        captured["body"] = request.content
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        delivered = await telegram_poller._dispatch_update(
            client,
            Settings(
                bot_token="test-token",
                telegram_webhook_secret="private-secret",
                telegram_update_mode="polling",
            ),
            {"update_id": 77, "callback_query": {"id": "callback"}},
        )

    assert delivered is True
    assert captured["url"] == "http://api:8000/telegram/webhook"
    assert captured["secret"] == "private-secret"
    assert b'"update_id":77' in captured["body"]


@pytest.mark.asyncio
async def test_dispatch_retries_server_failure_without_exposing_response() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="must not be logged or trusted")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        delivered = await telegram_poller._dispatch_update(
            client,
            Settings(
                bot_token="test-token",
                telegram_webhook_secret="private-secret",
                telegram_update_mode="polling",
            ),
            {"update_id": 78},
        )

    assert delivered is False


@pytest.mark.asyncio
async def test_poller_advances_offset_only_after_internal_dispatch(monkeypatch) -> None:
    offsets: list[int | None] = []
    dispatched: list[int] = []

    class FakeRedis:
        closed = False

        async def set(self, *_args, **_kwargs):
            return True

        async def aclose(self):
            self.closed = True

    redis = FakeRedis()

    async def fake_delete(_settings):
        return None

    async def fake_updates(_settings, *, offset, **_kwargs):
        offsets.append(offset)
        if len(offsets) == 1:
            return [{"update_id": 80, "message": {"text": "/start"}}]
        raise asyncio.CancelledError

    async def fake_dispatch(_client, _settings, update):
        dispatched.append(update["update_id"])
        return True

    monkeypatch.setattr(telegram_poller, "_disable_webhook", fake_delete)
    monkeypatch.setattr(telegram_poller, "get_updates", fake_updates)
    monkeypatch.setattr(telegram_poller, "_dispatch_update", fake_dispatch)
    monkeypatch.setattr(
        telegram_poller.Redis,
        "from_url",
        lambda *_args, **_kwargs: redis,
    )

    with pytest.raises(asyncio.CancelledError):
        await telegram_poller.run_poller(
            Settings(
                bot_token="test-token",
                telegram_webhook_secret="private-secret",
                telegram_update_mode="polling",
                redis_url="redis://test",
            )
        )

    assert offsets == [None, 81]
    assert dispatched == [80]
    assert redis.closed is True
