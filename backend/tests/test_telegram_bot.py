"""Unit tests for Telegram helpers (/start, menu, keyboards)."""

from app.services.telegram_bot import (
    extract_start_command,
    mini_app_keyboard,
    open_web_app_keyboard,
    start_welcome_text,
)


def test_mini_app_keyboard_deep_link() -> None:
    kb = mini_app_keyboard(
        bot_username="fil_fit_bot",
        startapp="workout_abc",
        button_text="Открыть",
    )
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Открыть"
    assert btn["url"] == "https://t.me/fil_fit_bot/app?startapp=workout_abc"


def test_open_web_app_keyboard() -> None:
    kb = open_web_app_keyboard(
        mini_app_url="https://example.ngrok-free.dev",
        button_text="Open",
    )
    assert kb is not None
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Open"
    assert btn["web_app"]["url"] == "https://example.ngrok-free.dev"


def test_start_welcome_mentions_open() -> None:
    text = start_welcome_text(first_name="Rom")
    assert "Rom" in text
    assert "Open" in text


def test_extract_start_command() -> None:
    update = {
        "update_id": 1,
        "message": {
            "message_id": 10,
            "text": "/start",
            "chat": {"id": 42, "type": "private"},
            "from": {"id": 42, "first_name": "Rom", "username": "rom"},
        },
    }
    got = extract_start_command(update)
    assert got is not None
    assert got["chat_id"] == 42
    assert got["first_name"] == "Rom"


def test_extract_start_ignores_other() -> None:
    assert extract_start_command({"message": {"text": "hello", "chat": {"id": 1}}}) is None
