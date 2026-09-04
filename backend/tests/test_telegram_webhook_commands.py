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


def callback_update(data: str) -> dict:
    return {
        "update_id": 3,
        "callback_query": {
            "id": "callback-1",
            "data": data,
            "message": {"message_id": 2, "chat": {"id": 42, "type": "private"}},
            "from": {"id": 42},
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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("data", "handler_name"),
    [("wa:250:2026-09-04", "_handle_water_callback"), ("si:t:deadbeef", "_handle_supplement_callback")],
)
async def test_callback_webhook_returns_before_processing(
    monkeypatch: pytest.MonkeyPatch,
    data: str,
    handler_name: str,
) -> None:
    calls: list[str] = []

    async def fake_handler(*_args, **_kwargs):
        calls.append("handled")

    async def fake_answer(*_args, **_kwargs):
        calls.append("answered")
        return {"ok": True}

    monkeypatch.setattr(telegram, handler_name, fake_handler)
    monkeypatch.setattr(telegram, "answer_callback_query", fake_answer)
    background_tasks = BackgroundTasks()

    result = await telegram.telegram_webhook(
        JsonRequest(callback_update(data)),  # type: ignore[arg-type]
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
    assert calls == ["answered", "handled"]


@pytest.mark.asyncio
async def test_expired_callback_ack_does_not_replay_or_block_action(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    async def expired(*_args, **_kwargs):
        raise telegram.TelegramBotError("query is too old")

    async def fake_handler(*_args, **_kwargs):
        calls.append("handled")

    monkeypatch.setattr(telegram, "answer_callback_query", expired)

    await telegram._process_callback(
        Settings(bot_token="test-token"),
        {"id": "old", "data": "wa:250"},
        fake_handler,
    )

    assert calls == ["handled"]
