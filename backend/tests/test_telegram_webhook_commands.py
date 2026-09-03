from __future__ import annotations

import pytest
from fastapi import BackgroundTasks

from app.core.config import Settings
from app.routers import telegram
from app.services import telegram_bot


class JsonRequest:
    def __init__(self, update: dict) -> None:
        self.update = update

    async def json(self) -> dict:
        return self.update


def command_update(text: str) -> dict:
    return {
        "update_id": 1,
        "message": {
            "message_id": 2,
            "text": text,
            "chat": {"id": 42, "type": "private"},
            "from": {"id": 42, "first_name": "Анна", "username": "anna"},
        },
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ["/start", "/help"])
async def test_user_commands_do_not_wait_for_global_bot_setup(
    monkeypatch: pytest.MonkeyPatch,
    command: str,
) -> None:
    calls: list[str] = []

    async def fail_commands(*_args, **_kwargs):
        raise AssertionError("setMyCommands must not run in a user command webhook")

    async def fail_menu(*_args, **_kwargs):
        raise AssertionError("setChatMenuButton must not run in a user command webhook")

    async def fake_welcome(*_args, **_kwargs):
        calls.append("welcome")
        return {"ok": True}

    async def fake_guide(*_args, **_kwargs):
        calls.append("guide")
        return {"ok": True}

    monkeypatch.setattr(telegram, "_ensure_bot_commands", fail_commands)
    monkeypatch.setattr(telegram, "_ensure_default_menu_button", fail_menu)
    monkeypatch.setattr(telegram, "send_start_welcome", fake_welcome)
    monkeypatch.setattr(telegram, "send_user_guide", fake_guide)
    monkeypatch.setattr(telegram, "_is_first_start", lambda *_args: False)
    monkeypatch.setattr(telegram, "_mark_guide_sent", lambda *_args: None)

    background_tasks = BackgroundTasks()
    result = await telegram.telegram_webhook(
        JsonRequest(command_update(command)),  # type: ignore[arg-type]
        background_tasks=background_tasks,
        settings=Settings(
            environment="development",
            bot_token="test-token",
            telegram_webhook_secret="unit-test-secret",
        ),
        x_telegram_bot_api_secret_token="unit-test-secret",
    )

    assert result == {"ok": True}
    assert calls == []
    await background_tasks()
    assert calls == (["welcome"] if command == "/start" else ["guide"])


@pytest.mark.asyncio
async def test_repeat_start_sends_one_concise_message(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []

    async def fake_send_message(*_args, **kwargs):
        calls.append(kwargs)
        return {"ok": True}

    monkeypatch.setattr(telegram_bot, "send_message", fake_send_message)

    await telegram_bot.send_start_welcome(
        Settings(
            bot_token="test-token",
            mini_app_url="https://app.filfitclub.ru",
        ),
        chat_id=42,
        first_name="Анна",
        send_full_guide=False,
    )

    assert len(calls) == 1
    assert calls[0]["reply_markup"]["inline_keyboard"]
