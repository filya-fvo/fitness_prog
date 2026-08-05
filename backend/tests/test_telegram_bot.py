"""Unit tests for Telegram helpers (/start, menu, keyboards)."""

from app.services.telegram_bot import (
    build_mini_app_open_url,
    extract_help_command,
    extract_start_command,
    load_user_guide_bytes,
    mini_app_keyboard,
    open_web_app_keyboard,
    start_welcome_text,
    user_guide_path,
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
        button_text="Open",
        mini_app_url="https://example.ngrok-free.dev",
    )
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Open"
    assert "web_app" in btn
    assert btn["web_app"]["url"].startswith("https://example.ngrok-free.dev/workouts/active/abc")


def test_mini_app_keyboard_fallback_tme_without_url() -> None:
    kb = mini_app_keyboard(
        bot_username="fil_fit_bot",
        startapp="workout_abc",
        button_text="Open",
        mini_app_url="",
    )
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Open"
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


def test_start_welcome_uses_first_name_variable() -> None:
    a = start_welcome_text(first_name="Viacheslav")
    b = start_welcome_text(first_name="Anna")
    assert "Viacheslav" in a
    assert "Anna" in b
    assert a.splitlines()[0] == "\u041f\u0440\u0438\u0432\u0435\u0442, Viacheslav!"
    assert b.splitlines()[0] == "\u041f\u0440\u0438\u0432\u0435\u0442, Anna!"
    assert "Open" in a
    assert "/help" in a


def test_start_welcome_has_no_browser_or_email_login() -> None:
    text = start_welcome_text(
        first_name="Rom",
        mini_app_url="https://example.ngrok-free.dev",
        include_guide_hint=True,
    )
    assert "https://example.ngrok-free.dev" not in text
    assert "http" not in text.lower()
    assert "email" not in text.lower()
    assert "docs/USER_GUIDE" not in text
    assert "Open" in text
    assert "/help" in text


def test_start_welcome_points_to_help_not_next_message() -> None:
    text = start_welcome_text(first_name="Rom")
    # "придёт по команде"
    assert "\u043f\u043e \u043a\u043e\u043c\u0430\u043d\u0434\u0435" in text or "/help" in text
    # should NOT say guide comes as next chat messages
    assert "\u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u043c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u043c" not in text


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


def test_user_guide_file_exists_and_loads() -> None:
    path = user_guide_path()
    assert path.is_file()
    filename, data = load_user_guide_bytes()
    assert filename.endswith(".md")
    assert len(data) > 500
    text = data.decode("utf-8")
    assert "Fitness" in text
    assert "\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f" in text or "Инструкция" in text


def test_extract_help_command() -> None:
    update = {
        "update_id": 2,
        "message": {
            "message_id": 11,
            "text": "/help",
            "chat": {"id": 42, "type": "private"},
            "from": {"id": 42, "first_name": "Rom", "username": "rom"},
        },
    }
    got = extract_help_command(update)
    assert got is not None
    assert got["chat_id"] == 42
    assert extract_help_command({"message": {"text": "/start", "chat": {"id": 1}}}) is None
