"""Unit tests for Telegram helpers (/start, menu, keyboards)."""

from pathlib import Path

import pytest

from app.core.config import Settings
from app.routers.telegram import _telegram_actor_is_admin
from app.services import telegram_bot
from app.services.telegram_bot import (
    admin_guide_path,
    bot_commands_reply_keyboard,
    build_mini_app_open_url,
    extract_admin_command,
    extract_help_command,
    extract_callback_query,
    extract_open_text_tap,
    extract_start_command,
    extract_web_app_data,
    load_admin_guide_bytes,
    load_user_guide_bytes,
    local_ai_restored_announcement_text,
    mini_app_keyboard,
    open_web_app_keyboard,
    start_welcome_text,
    supplement_intake_keyboard,
    user_guide_path,
    vps_cutover_announcement_text,
    water_intake_keyboard,
)


def test_local_ai_announcement_mentions_restoration_and_no_daily_limit() -> None:
    text = local_ai_restored_announcement_text()

    assert "снова работают" in text
    assert "Дневной лимит запросов снят" in text
    assert "фото этикетки" in text
    assert "без внешних AI-сервисов" in text


def test_vps_cutover_announcement_has_permanent_url_and_start_request() -> None:
    text = vps_cutover_announcement_text(mini_app_url="https://app.filfitclub.ru/")

    assert "https://app.filfitclub.ru" in text
    assert "круглосуточно" in text
    assert "/start" in text
    assert "домашнего компьютера" in text


def test_vps_cutover_announcement_rejects_non_https_url() -> None:
    with pytest.raises(ValueError):
        vps_cutover_announcement_text(mini_app_url="http://localhost:8001")


async def test_set_webhook_subscribes_to_inline_button_callbacks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_bot_api(
        _settings: Settings,
        method: str,
        payload: dict[str, object] | None = None,
        **_kwargs: object,
    ) -> dict[str, object]:
        captured["method"] = method
        captured["payload"] = payload or {}
        return {"ok": True}

    monkeypatch.setattr(telegram_bot, "bot_api", fake_bot_api)

    await telegram_bot.set_webhook(
        Settings(bot_token="test-token"),
        webhook_url="https://example.test/telegram/webhook",
    )

    assert captured["method"] == "setWebhook"
    assert captured["payload"]["allowed_updates"] == ["message", "callback_query"]  # type: ignore[index]


@pytest.mark.asyncio
async def test_standard_menu_replaces_persistent_open_button(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_bot_api(
        _settings: Settings,
        method: str,
        payload: dict[str, object] | None = None,
        **_kwargs: object,
    ) -> dict[str, object]:
        captured["method"] = method
        captured["payload"] = payload or {}
        return {"ok": True, "result": True}

    monkeypatch.setattr(telegram_bot, "bot_api", fake_bot_api)
    await telegram_bot.set_default_chat_menu_button(
        Settings(bot_token="test-token"),
        chat_id=42,
    )

    assert captured["method"] == "setChatMenuButton"
    assert captured["payload"] == {
        "chat_id": 42,
        "menu_button": {"type": "default"},
    }


@pytest.mark.asyncio
async def test_set_webhook_rejects_ngrok_before_api_call() -> None:
    with pytest.raises(telegram_bot.TelegramBotError):
        await telegram_bot.set_webhook(
            Settings(bot_token="test-token"),
            webhook_url="https://old.ngrok-free.dev/telegram/webhook",
        )


def test_supplement_keyboard_keeps_names_and_group_actions() -> None:
    first = "11111111-1111-1111-1111-111111111111"
    second = "22222222-2222-2222-2222-222222222222"
    keyboard = supplement_intake_keyboard([(first, "Креатин"), (second, "Протеин")])
    rows = keyboard["inline_keyboard"]
    assert rows[0][0]["text"] == "✅ Креатин"
    assert rows[0][0]["callback_data"] == f"si:t:{first}"
    assert rows[1][0]["text"] == "✅ Протеин"
    assert rows[2][0]["callback_data"] == f"si:a:{first}"
    assert rows[3][0]["callback_data"] == f"si:z:{first}"
    assert all(len(button["callback_data"].encode()) <= 64 for row in rows for button in row)


def test_extract_supplement_callback_query() -> None:
    parsed = extract_callback_query(
        {
            "callback_query": {
                "id": "callback-1",
                "data": "si:t:11111111-1111-1111-1111-111111111111",
                "from": {"id": 42},
                "message": {"message_id": 7, "chat": {"id": 42}},
            }
        }
    )
    assert parsed == {
        "id": "callback-1",
        "data": "si:t:11111111-1111-1111-1111-111111111111",
        "user_id": 42,
        "chat_id": 42,
        "message_id": 7,
    }


def test_build_mini_app_open_url_routes() -> None:
    base = "https://fitness-pc.example.ts.net"
    home = build_mini_app_open_url(base, startapp="home")
    assert home.startswith(f"{base}/?startapp=home&_fv=")
    assert build_mini_app_open_url(base, startapp="profile").startswith(f"{base}/profile")
    assert "tab=supplements" in build_mini_app_open_url(base, startapp="supplements")
    workout = build_mini_app_open_url(base, startapp="workout_abc")
    assert workout.startswith(f"{base}/workouts/active/abc?startapp=workout_abc&_fv=")
    water = build_mini_app_open_url(base, startapp="water")
    assert water.startswith(f"{base}/?startapp=water&_fv=")


def test_water_keyboard_can_log_or_open_daily_checkin() -> None:
    keyboard = water_intake_keyboard(
        bot_username="fil_fit_bot",
        mini_app_url="https://fitness-pc.example.ts.net",
    )
    rows = keyboard["inline_keyboard"]
    assert rows[0][0]["callback_data"] == "wa:250"
    water_url = rows[1][0]["web_app"]["url"]
    assert "/?" in water_url
    assert "startapp=water" in water_url
    assert "_fv=" in water_url


def test_mini_app_keyboard_prefers_web_app_when_url_set() -> None:
    kb = mini_app_keyboard(
        bot_username="fil_fit_bot",
        startapp="workout_abc",
        button_text="Open",
        mini_app_url="https://fitness-pc.example.ts.net",
    )
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Open"
    assert "web_app" in btn
    assert btn["web_app"]["url"].startswith("https://fitness-pc.example.ts.net/workouts/active/abc")
    assert "_fv=" in btn["web_app"]["url"]


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
        mini_app_url="https://fitness-pc.example.ts.net",
        button_text="Open",
        startapp="home",
    )
    assert kb is not None
    btn = kb["inline_keyboard"][0][0]
    assert btn["text"] == "Open"
    assert btn["web_app"]["url"].startswith("https://fitness-pc.example.ts.net/?")
    assert "startapp=home" in btn["web_app"]["url"]
    assert "_fv=" in btn["web_app"]["url"]


def test_runtime_rejects_deprecated_ngrok_mini_app_url() -> None:
    settings = Settings(mini_app_url="https://old-address.ngrok-free.dev")
    assert telegram_bot.resolve_mini_app_url(settings) == ""
    assert telegram_bot.open_app_markup(settings) is None
    assert "ngrok" not in str(telegram_bot.open_app_markup(settings)).lower()


def test_open_url_builder_rejects_unsafe_or_obsolete_hosts() -> None:
    assert build_mini_app_open_url("http://localhost:5173", startapp="home") == ""
    assert build_mini_app_open_url("https://old.ngrok-free.dev", startapp="home") == ""


def test_bot_commands_reply_keyboard_has_start_help() -> None:
    kb = bot_commands_reply_keyboard(None)
    assert kb["resize_keyboard"] is True
    assert kb["is_persistent"] is True
    flat = [btn["text"] for row in kb["keyboard"] for btn in row]
    assert "/start" in flat
    assert "/help" in flat


def test_bot_commands_reply_keyboard_never_duplicates_open_button() -> None:
    settings = Settings(mini_app_url="https://fitness-pc.example.ts.net")
    kb = bot_commands_reply_keyboard(settings)
    flat = [button["text"] for row in kb["keyboard"] for button in row]
    assert flat == ["/start", "/help"]
    assert "Open" not in flat


def test_start_welcome_uses_first_name_variable() -> None:
    a = start_welcome_text(first_name="Viacheslav")
    b = start_welcome_text(first_name="Anna")
    assert "Viacheslav" in a
    assert "Anna" in b
    assert a.splitlines()[0] == "\u041f\u0440\u0438\u0432\u0435\u0442, Viacheslav!"
    assert b.splitlines()[0] == "\u041f\u0440\u0438\u0432\u0435\u0442, Anna!"
    assert "Open" in a
    assert "/help" in a


def test_start_welcome_mentions_email_link_and_browser_url() -> None:
    text = start_welcome_text(
        first_name="Rom",
        mini_app_url="https://fitness-pc.example.ts.net",
        include_guide_hint=True,
    )
    assert "https://fitness-pc.example.ts.net" in text
    assert "обычном браузере" in text
    assert "docs/USER_GUIDE" not in text
    assert "Open" in text
    assert "/help" in text
    # Browser email login is documented for users
    assert "почт" in text.lower() or "email" in text.lower()
    assert "Профиль" in text or "браузер" in text.lower()


def test_start_welcome_points_to_help_not_next_message() -> None:
    text = start_welcome_text(first_name="Rom")
    # "придёт по команде"
    assert "\u043f\u043e \u043a\u043e\u043c\u0430\u043d\u0434\u0435" in text or "/help" in text
    # should NOT say guide comes as next chat messages
    assert "\u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u043c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u043c" not in text


def test_extract_web_app_data() -> None:
    update = {
        "message": {
            "chat": {"id": 42},
            "from": {"id": 7, "first_name": "A"},
            "web_app_data": {"data": '{"event":"web_app_opened"}'},
        }
    }
    got = extract_web_app_data(update)
    assert got is not None
    assert got["chat_id"] == 42
    assert got["user_id"] == 7
    assert "web_app_opened" in got["data"]


def test_extract_open_text_tap() -> None:
    update = {
        "message": {
            "chat": {"id": 1},
            "from": {"id": 2},
            "text": "Open",
        }
    }
    got = extract_open_text_tap(update)
    assert got is not None
    assert got["chat_id"] == 1
    assert extract_open_text_tap({"message": {"chat": {"id": 1}, "text": "hello"}}) is None


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


def test_production_images_include_telegram_guides() -> None:
    root = Path(__file__).resolve().parents[2]
    backend_dockerfile = (root / "backend" / "Dockerfile").read_text(encoding="utf-8")
    combined_dockerfile = (root / "Dockerfile").read_text(encoding="utf-8")
    compose = (root / "docker-compose.yml").read_text(encoding="utf-8")
    render = (root / "render.yaml").read_text(encoding="utf-8")

    copy_instruction = "COPY docs/USER_GUIDE.md docs/LOCAL_ADMIN_GUIDE.md /docs/"
    assert copy_instruction in backend_dockerfile
    assert copy_instruction in combined_dockerfile
    assert compose.count("dockerfile: backend/Dockerfile") == 3
    assert render.count("dockerContext: .") == 2


def test_admin_guide_file_exists_and_loads() -> None:
    assert admin_guide_path().is_file()
    filename, data = load_admin_guide_bytes()
    assert "Admin" in filename
    text = data.decode("utf-8")
    assert "инструкция администратора" in text.lower()
    assert "start_all_comand.bat" in text


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


def test_extract_hidden_admin_command() -> None:
    update = {
        "message": {
            "text": "/admin",
            "chat": {"id": 42, "type": "private"},
            "from": {"id": 42, "username": "Owner"},
        }
    }
    got = extract_admin_command(update)
    assert got is not None
    assert got["user_id"] == 42
    assert got["username"] == "Owner"


@pytest.mark.asyncio
async def test_admin_command_is_not_published_in_telegram_menu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_bot_api(
        _settings: Settings,
        method: str,
        payload: dict[str, object] | None = None,
        **_kwargs: object,
    ) -> dict[str, object]:
        captured["method"] = method
        captured["payload"] = payload or {}
        return {"ok": True}

    monkeypatch.setattr(telegram_bot, "bot_api", fake_bot_api)
    await telegram_bot.set_bot_commands(Settings(bot_token="test-token"))
    assert captured["method"] == "setMyCommands"
    commands = captured["payload"]["commands"]  # type: ignore[index]
    assert [item["command"] for item in commands] == ["start", "help"]  # type: ignore[index]


def test_hidden_admin_command_authorization() -> None:
    settings = Settings(
        admin_telegram_ids="42",
        admin_telegram_usernames="Owner",
    )
    assert _telegram_actor_is_admin(
        settings,
        {"chat_id": 42, "user_id": 42, "username": "someone"},
    )
    assert _telegram_actor_is_admin(
        settings,
        {"chat_id": 7, "user_id": 7, "username": "owner"},
    )
    assert not _telegram_actor_is_admin(
        settings,
        {"chat_id": -100123, "user_id": 42, "username": "Owner"},
    )
    assert not _telegram_actor_is_admin(
        settings,
        {"chat_id": 99, "user_id": 99, "username": "stranger"},
    )
