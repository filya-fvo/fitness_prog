"""Unit tests for Telegram helpers (/start, menu, keyboards)."""

from app.services.telegram_bot import (
    build_mini_app_open_url,
    extract_start_command,
    mini_app_keyboard,
    open_web_app_keyboard,
    start_welcome_text,
)


def test_build_mini_app_open_url_routes() -> None:
    base = "https://example.ngrok-free.dev"
    assert build_mini_app_open_url(base, startapp="home") == f"{base}/?startapp=home"
    assert build_mini_app_open_url(base, startapp="profile").startswith(f"{base}/profile")
    assert "tab=supplements" in build_mini_app_open_url(base, startapp="supplements")
    assert build_mini_app_open_url(base, startapp="workout_abc") == (
        f"{base}/workouts/active/abc?startapp=workout_abc"
    )


def test_mini_app_keyboard_prefers_web_app_when_url_set() -> None:
    kb = mini_app_keyboard(
        bot_username="fil_fit_bot",
        startapp="workout_abc",
        button_text="Открыть",
        mini_app_url="https://example.ngrok-free.dev",
    )
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Открыть"
    assert "web_app" in btn
    assert btn["web_app"]["url"].startswith("https://example.ngrok-free.dev/workouts/active/abc")


def test_mini_app_keyboard_fallback_tme_without_url() -> None:
    kb = mini_app_keyboard(
        bot_username="fil_fit_bot",
        startapp="workout_abc",
        button_text="Открыть",
        mini_app_url="",
    )
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Открыть"
    assert btn["url"] == "https://t.me/fil_fit_bot?startapp=workout_abc"


def test_open_web_app_keyboard() -> None:
    kb = open_web_app_keyboard(
        mini_app_url="https://example.ngrok-free.dev",
        button_text="Open",
        startapp="home",
    )
    assert kb is not None
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Open"
    assert btn["web_app"]["url"] == "https://example.ngrok-free.dev/?startapp=home"


def test_start_welcome_mentions_open() -> None:
    text = start_welcome_text(first_name="Rom")
    assert "Rom" in text
    assert "Open" in text


def test_start_welcome_includes_web_url() -> None:
    text = start_welcome_text(
        first_name="Rom",
        mini_app_url="https://example.ngrok-free.dev",
    )
    assert "https://example.ngrok-free.dev" in text
    assert "браузере" in text
    assert "email" in text.lower()


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
