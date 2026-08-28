"""The production Telegram smoke must stay single-recipient and opt-in."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.config import Settings
from scripts import smoke_telegram_delivery


@pytest.mark.asyncio
async def test_smoke_sends_three_messages_to_one_configured_id(monkeypatch) -> None:
    calls: list[tuple[str, int]] = []

    async def fake_message(_settings, *, telegram_id, **_kwargs):
        calls.append(("personal", telegram_id))

    async def fake_guide(_settings, *, chat_id, **_kwargs):
        calls.append(("guide", chat_id))

    async def fake_broadcast(_settings, *, telegram_id, **_kwargs):
        calls.append(("broadcast", telegram_id))

    monkeypatch.setattr(smoke_telegram_delivery, "send_app_notification", fake_message)
    monkeypatch.setattr(smoke_telegram_delivery, "send_user_guide", fake_guide)
    monkeypatch.setattr(smoke_telegram_delivery, "send_broadcast_test_message", fake_broadcast)

    await smoke_telegram_delivery.send_smoke_messages(
        Settings(admin_smoke_telegram_id=4242, jwt_secret="test"), 4242
    )

    assert calls == [("personal", 4242), ("guide", 4242), ("broadcast", 4242)]


@pytest.mark.asyncio
async def test_smoke_refuses_missing_config_before_database_access(monkeypatch) -> None:
    entered = False

    class ForbiddenSession:
        async def __aenter__(self):
            nonlocal entered
            entered = True
            return SimpleNamespace()

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr(smoke_telegram_delivery, "AsyncSessionLocal", ForbiddenSession)
    with pytest.raises(RuntimeError, match="ADMIN_SMOKE_TELEGRAM_ID"):
        await smoke_telegram_delivery.configured_recipient(Settings(jwt_secret="test"))
    assert entered is False
