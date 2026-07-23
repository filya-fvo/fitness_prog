"""Unit tests for Telegram deep-link keyboard builder."""

from app.services.telegram_bot import mini_app_keyboard


def test_mini_app_keyboard_deep_link() -> None:
    kb = mini_app_keyboard(
        bot_username="fil_fit_bot",
        startapp="workout_abc",
        button_text="Открыть",
    )
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Открыть"
    assert btn["url"] == "https://t.me/fil_fit_bot/app?startapp=workout_abc"
