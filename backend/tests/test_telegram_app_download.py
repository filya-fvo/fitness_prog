"""APK download command contracts at the Telegram API boundary."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import BackgroundTasks

from app.core.config import Settings
from app.routers import telegram
from app.services import telegram_bot


class JsonRequest:
    def __init__(self, update: dict[str, Any]) -> None:
        self.update = update

    async def json(self) -> dict[str, Any]:
        return self.update


def command_update(text: str = "/app", chat_type: str = "private") -> dict[str, Any]:
    return {
        "update_id": 123,
        "message": {
            "message_id": 2,
            "text": text,
            "chat": {"id": 42, "type": chat_type},
            "from": {"id": 42, "first_name": "Анна", "username": "anna"},
        },
    }


def settings_for(url: str, mode: str = "polling") -> Settings:
    return Settings(
        environment="development",
        bot_token="test-token",
        mini_app_url=url,
        telegram_webhook_secret="unit-test-secret",
        telegram_update_mode=mode,
    )


async def dispatch(
    update: dict[str, Any], settings: Settings, tasks: BackgroundTasks
) -> dict[str, Any]:
    return await telegram.telegram_webhook(
        JsonRequest(update),  # type: ignore[arg-type]
        background_tasks=tasks,
        settings=settings,
        x_telegram_bot_api_secret_token="unit-test-secret",
    )


@pytest.fixture
def api_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict[str, Any]]]:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def fake_api(
        _settings: Settings,
        method: str,
        payload: dict[str, Any] | None = None,
        **_kwargs: Any,
    ) -> dict[str, Any]:
        calls.append((method, payload or {}))
        return {"ok": True, "result": {"message_id": 5}}

    monkeypatch.setattr(telegram_bot, "bot_api", fake_api)
    return calls


async def test_slash_menu_publishes_download_command(api_calls) -> None:
    await telegram_bot.set_bot_commands(settings_for("https://app.filfitclub.ru"))
    assert api_calls[0][0] == "setMyCommands"
    commands = api_calls[0][1]["commands"]
    assert {item["command"] for item in commands} == {"start", "help", "app"}
    app = next(item for item in commands if item["command"] == "app")
    assert "Android" in app["description"]


def test_persistent_keyboard_offers_download_command() -> None:
    keyboard = telegram_bot.bot_commands_reply_keyboard()
    assert keyboard["is_persistent"] is True
    assert [button["text"] for row in keyboard["keyboard"] for button in row] == [
        "/start",
        "/help",
        "/app",
    ]
    assert "/app" in telegram_bot.help_overview_text()
    assert "/app" in telegram_bot.start_welcome_text()


@pytest.mark.parametrize("text", ["/app", "/app@fil_fit_bot", " /app "])
async def test_private_app_command_sends_https_download_button(api_calls, text) -> None:
    tasks = BackgroundTasks()
    result = await dispatch(command_update(text), settings_for("https://app.filfitclub.ru/"), tasks)
    assert result == {"ok": True}
    assert len(tasks.tasks) == 0
    assert len(api_calls) == 1
    method, payload = api_calls[0]
    assert method == "sendMessage"
    assert payload["chat_id"] == 42
    assert "Android" in payload["text"]
    assert payload["reply_markup"] == {
        "inline_keyboard": [
            [
                {
                    "text": "Скачать для Android",
                    "url": "https://app.filfitclub.ru/android/latest.apk",
                }
            ]
        ]
    }


async def test_download_uses_configured_origin_without_app_route_or_query(api_calls) -> None:
    await dispatch(
        command_update(),
        settings_for("https://fitness.example.test/profile?startapp=home#settings"),
        BackgroundTasks(),
    )
    assert len(api_calls) == 1
    assert api_calls[0][1]["reply_markup"]["inline_keyboard"][0][0]["url"] == (
        "https://fitness.example.test/android/latest.apk"
    )


@pytest.mark.parametrize(
    "url",
    [
        "",
        "http://app.filfitclub.ru",
        "https://old.ngrok-free.dev",
        "https://",
        "https://token@app.filfitclub.ru",
        "https://localhost",
        "https://127.0.0.1",
        "https://10.0.0.1",
        "https://[::1]",
        "https://app.local",
        "https://llm",
        "https://app.filfitclub.ru:bad",
        "https://app.filfitclub.ru\\evil",
        "https://app.filfitclub.ru\n.evil.test",
    ],
)
async def test_unavailable_or_unsafe_url_sends_preparation_message_without_link(
    api_calls, url
) -> None:
    await dispatch(command_update(), settings_for(url), BackgroundTasks())
    assert len(api_calls) == 1
    method, payload = api_calls[0]
    assert method == "sendMessage"
    assert "готов" in payload["text"]
    assert "https://" not in payload["text"]
    assert payload.get("reply_markup") is None


@pytest.mark.parametrize(
    ("text", "chat_type"),
    [
        ("/app", "group"),
        ("/app@fil_fit_bot", "supergroup"),
        ("/app", "channel"),
        ("/apple", "private"),
        ("/app_extra", "private"),
        ("app", "private"),
        ("/app@", "private"),
        ("/app@bot/path", "private"),
    ],
)
async def test_app_dispatch_ignores_group_or_unrelated_command(api_calls, text, chat_type) -> None:
    tasks = BackgroundTasks()
    assert await dispatch(
        command_update(text, chat_type), settings_for("https://app.filfitclub.ru"), tasks
    ) == {"ok": True}
    await tasks()
    assert api_calls == []


async def test_webhook_download_sends_only_in_background(api_calls) -> None:
    tasks = BackgroundTasks()
    assert await dispatch(
        command_update(), settings_for("https://app.filfitclub.ru", "webhook"), tasks
    ) == {"ok": True}
    assert api_calls == []
    assert len(tasks.tasks) == 1
    await tasks()
    assert len(api_calls) == 1
    assert api_calls[0][0] == "sendMessage"


async def test_polling_download_failure_bubbles_for_update_retry(monkeypatch) -> None:
    async def unavailable(*_args, **_kwargs):
        raise telegram_bot.TelegramBotError("temporary transport error")

    monkeypatch.setattr(telegram_bot, "bot_api", unavailable)
    with pytest.raises(telegram_bot.TelegramBotError, match="temporary"):
        await dispatch(
            command_update(), settings_for("https://app.filfitclub.ru"), BackgroundTasks()
        )


async def test_webhook_download_failure_is_logged_without_exception_or_token(monkeypatch) -> None:
    async def unavailable(*_args, **_kwargs):
        raise telegram_bot.TelegramBotError("secret-test-token transport error")

    monkeypatch.setattr(telegram_bot, "bot_api", unavailable)
    logs: list[str] = []
    sink = telegram.logger.add(lambda message: logs.append(str(message)))
    try:
        tasks = BackgroundTasks()
        assert await dispatch(
            command_update(), settings_for("https://app.filfitclub.ru", "webhook"), tasks
        ) == {"ok": True}
        await tasks()
    finally:
        telegram.logger.remove(sink)
    errors = [line for line in logs if "telegram_app_reply_failed" in line]
    assert len(errors) == 1
    assert "secret-test-token" not in errors[0]
    assert "chat=42" in errors[0]
