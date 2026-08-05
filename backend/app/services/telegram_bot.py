"""Telegram Bot API helpers — /start, menu Open button, reminders (TZ §7)."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import httpx
from loguru import logger

from app.core.config import Settings


class TelegramBotError(Exception):
    """Raised when Telegram Bot API call fails or bot is misconfigured."""


def _token_ready(settings: Settings) -> bool:
    return bool(settings.bot_token) and not settings.bot_token.startswith("replace_with")


def resolve_mini_app_url(settings: Settings) -> str:
    """HTTPS URL of the Mini App front (Menu Button / web_app)."""
    return (settings.mini_app_url or "").strip().rstrip("/")


async def bot_api(
    settings: Settings,
    method: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout: float = 20.0,
) -> dict[str, Any]:
    """Call Telegram Bot API method. Raises TelegramBotError on failure."""
    if not _token_ready(settings):
        raise TelegramBotError("BOT_TOKEN is not configured")

    url = f"https://api.telegram.org/bot{settings.bot_token}/{method}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload or {})
        data = resp.json()
        if resp.status_code >= 400 or not data.get("ok"):
            logger.error(
                "telegram_api_failed method={} status={} body={}",
                method,
                resp.status_code,
                data,
            )
            raise TelegramBotError(str(data.get("description") or resp.text))
        return data


async def send_message(
    settings: Settings,
    *,
    chat_id: int,
    text: str,
    reply_markup: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """POST sendMessage to Telegram Bot API."""
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    return await bot_api(settings, "sendMessage", payload)


async def send_document(
    settings: Settings,
    *,
    chat_id: int,
    filename: str,
    content: bytes,
    caption: str | None = None,
    reply_markup: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """POST sendDocument (multipart) to Telegram Bot API."""
    if not _token_ready(settings):
        raise TelegramBotError("BOT_TOKEN is not configured")

    import json as _json

    url = f"https://api.telegram.org/bot{settings.bot_token}/sendDocument"
    data: dict[str, Any] = {"chat_id": str(chat_id)}
    if caption:
        data["caption"] = caption
        data["parse_mode"] = "HTML"
    if reply_markup is not None:
        data["reply_markup"] = _json.dumps(reply_markup, ensure_ascii=False)

    files = {
        "document": (filename, content, "text/markdown; charset=utf-8"),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, data=data, files=files)
        body = resp.json()
        if resp.status_code >= 400 or not body.get("ok"):
            logger.error(
                "telegram_api_failed method=sendDocument status={} body={}",
                resp.status_code,
                body,
            )
            raise TelegramBotError(str(body.get("description") or resp.text))
        return body


def build_mini_app_open_url(
    mini_app_url: str,
    *,
    startapp: str | None = None,
) -> str:
    """
    Build HTTPS Mini App URL opened by web_app buttons.

    Prefer real public front (ngrok/prod) over t.me/.../app Direct Links:
    Direct Links only work after BotFather Main Mini App / short name setup.
    startapp is passed as query so the SPA can route even when
    initDataUnsafe.start_param is empty (common for web_app URL buttons).
    """
    base = (mini_app_url or "").strip().rstrip("/")
    if not base:
        return ""
    # Map logical targets to SPA paths (React Router)
    path = "/"
    query: dict[str, str] = {}
    key = (startapp or "").strip()
    if key.startswith("workout_") and len(key) > len("workout_"):
        wid = key[len("workout_") :]
        path = f"/workouts/active/{quote(wid, safe='')}"
        query["startapp"] = key
    elif key in {"supplements", "alerts", "notifications"}:
        path = "/profile"
        query["startapp"] = key
        query["tab"] = "supplements" if key == "supplements" else "alerts"
    elif key in {"profile", "me"}:
        path = "/profile"
        query["startapp"] = key
    elif key in {"nutrition", "food"}:
        path = "/nutrition"
        query["startapp"] = key
    elif key in {"programs", "workouts"}:
        path = f"/{key}"
        query["startapp"] = key
    elif key in {"ai", "coach", "chat"}:
        path = "/ai"
        query["startapp"] = key
    else:
        path = "/"
        if key:
            query["startapp"] = key

    url = f"{base}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"
    return url


def open_web_app_keyboard(
    *,
    mini_app_url: str,
    button_text: str = "Open",
    startapp: str | None = None,
) -> dict[str, Any] | None:
    """Inline keyboard with web_app button. None if mini_app_url empty."""
    url = build_mini_app_open_url(mini_app_url, startapp=startapp)
    if not url.startswith("https://"):
        return None
    return {
        "inline_keyboard": [
            [{"text": button_text, "web_app": {"url": url}}],
        ],
    }


def mini_app_keyboard(
    *,
    bot_username: str,
    startapp: str | None = None,
    button_text: str = "Open",
    mini_app_url: str = "",
) -> dict[str, Any]:
    """
    Inline keyboard into Mini App.

    Prefer web_app + MINI_APP_URL (works with ngrok without BotFather Direct Link).
    Fallback: t.me deep link (needs Main Mini App configured in BotFather).
    """
    web = open_web_app_keyboard(
        mini_app_url=mini_app_url,
        button_text=button_text,
        startapp=startapp,
    )
    if web is not None:
        return web

    username = bot_username.lstrip("@")
    # Direct Link formats Telegram accepts when Main App is configured
    param = quote((startapp or "home").strip() or "home", safe="")
    url = f"https://t.me/{username}?startapp={param}"
    return {
        "inline_keyboard": [[{"text": button_text, "url": url}]],
    }


def start_welcome_text(
    *,
    first_name: str | None = None,
    mini_app_url: str | None = None,
    include_guide_hint: bool = True,
) -> str:
    """Short /start greeting. first_name is taken from Telegram profile (variable)."""
    _ = mini_app_url  # API compatibility; not shown (no browser/email login)
    _ = include_guide_hint  # always the same short text
    name = (first_name or "").strip()
    hello = f"\u041f\u0440\u0438\u0432\u0435\u0442, {name}!" if name else "\u041f\u0440\u0438\u0432\u0435\u0442!"
    lines = [
        hello,
        "",
        "\u042d\u0442\u043e <b>Fitness Mini App</b> \u2014 \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u044b, \u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0438, \u043f\u0438\u0442\u0430\u043d\u0438\u0435, \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u0438 AI-\u0442\u0440\u0435\u043d\u0435\u0440.",
        "",
        "\u0427\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u2014 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 <b>Open</b> \u043d\u0438\u0436\u0435 \u0438\u043b\u0438 \u0441\u0438\u043d\u044e\u044e \u043a\u043d\u043e\u043f\u043a\u0443 \u043c\u0435\u043d\u044e.",
        "",
        "\u0412\u0445\u043e\u0434 \u0442\u043e\u043b\u044c\u043a\u043e \u0447\u0435\u0440\u0435\u0437 Telegram Mini App (\u043a\u043d\u043e\u043f\u043a\u0430 Open).",
        "",
        "\u2022 \u041f\u0435\u0440\u0432\u044b\u0439 \u0432\u0445\u043e\u0434: \u043a\u043e\u0440\u043e\u0442\u043a\u0430\u044f \u0430\u043d\u043a\u0435\u0442\u0430 (\u0446\u0435\u043b\u044c, \u0443\u0440\u043e\u0432\u0435\u043d\u044c, \u0442\u0435\u043b\u043e).",
        "\u2022 <b>\u0413\u043b\u0430\u0432\u043d\u0430\u044f \u2192 \u0421\u0435\u0433\u043e\u0434\u043d\u044f</b> \u2014 \u0441\u0442\u0430\u0440\u0442/\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0435 \u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0438.",
        "\u2022 \u0412 \u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0435: \u043f\u043e\u0434\u0445\u043e\u0434\u044b, \u043e\u0442\u0434\u044b\u0445, \u0437\u0430\u043c\u0435\u043d\u0430 \u0443\u043f\u0440\u0430\u0436\u043d\u0435\u043d\u0438\u0439, GIF/\u0432\u0438\u0434\u0435\u043e.",
        "\u2022 \u0412\u0435\u0440\u043d\u0443\u0442\u044c \u0443\u043f\u0440\u0430\u0436\u043d\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u044b: <b>\u0413\u043b\u0430\u0432\u043d\u0430\u044f \u2192 \u0421\u0435\u0433\u043e\u0434\u043d\u044f \u2192 \u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c\u2026</b>",
        "\u2022 \u041f\u0438\u0442\u0430\u043d\u0438\u0435, \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441, AI \u2014 \u0432 \u043d\u0438\u0436\u043d\u0435\u043c \u043c\u0435\u043d\u044e.",
        "",
        "\u041f\u043e\u043b\u043d\u0430\u044f \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f \u043f\u0440\u0438\u0434\u0451\u0442 \u043f\u043e \u043a\u043e\u043c\u0430\u043d\u0434\u0435 <b>/help</b>.",
    ]
    return "\n".join(lines)


def user_guide_path() -> Path:
    """Path to docs/USER_GUIDE.md (repo root / docs)."""
    # backend/app/services/telegram_bot.py -> repo root
    return Path(__file__).resolve().parents[3] / "docs" / "USER_GUIDE.md"


def load_user_guide_bytes() -> tuple[str, bytes]:
    """Load user guide markdown file for Telegram sendDocument."""
    path = user_guide_path()
    if not path.is_file():
        raise TelegramBotError(f"User guide not found: {path}")
    data = path.read_bytes()
    try:
        text = data.decode("utf-8-sig")
        data = text.encode("utf-8")
    except UnicodeDecodeError as exc:
        raise TelegramBotError(f"User guide is not valid UTF-8: {exc}") from exc
    return "Fitness_Mini_App_Instrukciya.md", data


def open_app_markup(settings: Settings) -> dict[str, Any] | None:
    """Inline Open button for Mini App (web_app preferred)."""
    mini_url = resolve_mini_app_url(settings)
    markup: dict[str, Any] | None = None
    if mini_url:
        markup = open_web_app_keyboard(
            mini_app_url=mini_url,
            button_text="Open",
            startapp="home",
        )
    if markup is None and settings.bot_username:
        username = settings.bot_username.lstrip("@")
        markup = {
            "inline_keyboard": [
                [{"text": "Open", "url": f"https://t.me/{username}/app"}],
            ],
        }
    return markup


async def send_user_guide(
    settings: Settings,
    *,
    chat_id: int,
    with_open_button: bool = True,
    with_open_button_on_last: bool | None = None,
) -> dict[str, Any]:
    """Send full user guide as a downloadable Markdown file."""
    # with_open_button_on_last kept for older call sites
    if with_open_button_on_last is not None:
        with_open_button = with_open_button_on_last
    filename, content = load_user_guide_bytes()
    caption = (
        "\U0001f4d6 <b>\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f Fitness Mini App</b>\n"
        "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0444\u0430\u0439\u043b \u0432 Telegram "
        "\u0438\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u0435 \u043d\u0430 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e."
    )
    markup = open_app_markup(settings) if with_open_button else None
    return await send_document(
        settings,
        chat_id=chat_id,
        filename=filename,
        content=content,
        caption=caption,
        reply_markup=markup,
    )


async def send_start_welcome(
    settings: Settings,
    *,
    chat_id: int,
    first_name: str | None = None,
    send_full_guide: bool = False,
) -> dict[str, Any]:
    """Reply to /start with short welcome + Open. Optionally attach guide file."""
    text = start_welcome_text(first_name=first_name)
    result = await send_message(
        settings,
        chat_id=chat_id,
        text=text,
        reply_markup=open_app_markup(settings),
    )
    if send_full_guide:
        await send_user_guide(settings, chat_id=chat_id, with_open_button=True)
    return result


async def set_chat_menu_button(
    settings: Settings,
    *,
    mini_app_url: str | None = None,
    text: str = "Open",
    chat_id: int | None = None,
) -> dict[str, Any]:
    """
    Set Menu Button (blue Open next to message field / in chat list).

    chat_id=None -> default for all users.
    """
    url = (mini_app_url or resolve_mini_app_url(settings) or "").strip().rstrip("/")
    if not url.startswith("https://"):
        raise TelegramBotError("MINI_APP_URL must be https:// for Menu Button")

    menu_button: dict[str, Any] = {
        "type": "web_app",
        "text": text or "Open",
        "web_app": {"url": url},
    }
    payload: dict[str, Any] = {"menu_button": menu_button}
    if chat_id is not None:
        payload["chat_id"] = chat_id
    return await bot_api(settings, "setChatMenuButton", payload)


async def set_webhook(
    settings: Settings,
    *,
    webhook_url: str,
    secret_token: str | None = None,
    drop_pending: bool = False,
) -> dict[str, Any]:
    """Register Telegram webhook for /start and other updates."""
    url = webhook_url.strip()
    if not url.startswith("https://"):
        raise TelegramBotError("webhook_url must be https://")
    payload: dict[str, Any] = {
        "url": url,
        "allowed_updates": ["message"],
        "drop_pending_updates": drop_pending,
    }
    token = secret_token if secret_token is not None else settings.telegram_webhook_secret
    if token:
        payload["secret_token"] = token
    return await bot_api(settings, "setWebhook", payload)


async def delete_webhook(settings: Settings, *, drop_pending: bool = False) -> dict[str, Any]:
    return await bot_api(
        settings,
        "deleteWebhook",
        {"drop_pending_updates": drop_pending},
    )


async def get_webhook_info(settings: Settings) -> dict[str, Any]:
    return await bot_api(settings, "getWebhookInfo", {})


async def send_workout_reminder(
    settings: Settings,
    *,
    telegram_id: int,
    workout_id: str,
    title: str = "Напоминание о тренировке",
) -> dict[str, Any]:
    return await send_app_notification(
        settings,
        telegram_id=telegram_id,
        title=title,
        text="Пора тренироваться! Откройте Mini App и начните сессию.",
        startapp=f"workout_{workout_id}",
    )


async def send_app_notification(
    settings: Settings,
    *,
    telegram_id: int,
    title: str,
    text: str,
    startapp: str | None = "home",
) -> dict[str, Any]:
    """Send HTML notification with Mini App Open button (web_app preferred)."""
    body = f"🔔 <b>{title}</b>\n{text}"
    target = (startapp or "home").strip() or "home"
    mini_url = resolve_mini_app_url(settings)
    markup: dict[str, Any] | None = None
    if mini_url:
        markup = open_web_app_keyboard(
            mini_app_url=mini_url,
            button_text="Open",
            startapp=target,
        )
    if markup is None and settings.bot_username:
        markup = mini_app_keyboard(
            bot_username=settings.bot_username,
            startapp=target,
            button_text="Open",
            mini_app_url=mini_url,
        )

    if markup is None:
        logger.warning(
            "notification_without_open_button telegram_id={} reason=no_MINI_APP_URL_or_bot_username",
            telegram_id,
        )

    return await send_message(
        settings,
        chat_id=telegram_id,
        text=body,
        reply_markup=markup,
    )


def extract_bot_command(update: dict[str, Any], command: str) -> dict[str, Any] | None:
    """If update is a private message with /command (optional @BotName), return chat/user info."""
    message = update.get("message") or update.get("edited_message")
    if not isinstance(message, dict):
        return None
    text = str(message.get("text") or "").strip()
    if not text.startswith("/"):
        return None
    first = text.split(maxsplit=1)[0]
    base = command.lstrip("/")
    cmd = f"/{base}"
    if not (first == cmd or first.startswith(f"{cmd}@")):
        return None

    chat = message.get("chat") or {}
    user = message.get("from") or {}
    if not isinstance(chat, dict) or chat.get("id") is None:
        return None

    payload = ""
    parts = text.split(maxsplit=1)
    if len(parts) > 1:
        payload = parts[1].strip()

    return {
        "chat_id": int(chat["id"]),
        "user_id": int(user["id"]) if user.get("id") is not None else None,
        "first_name": user.get("first_name"),
        "username": user.get("username"),
        "start_payload": payload or None,
        "command": base,
    }


def extract_start_command(update: dict[str, Any]) -> dict[str, Any] | None:
    """If update is a private /start message, return chat/user info."""
    return extract_bot_command(update, "start")


def extract_help_command(update: dict[str, Any]) -> dict[str, Any] | None:
    """If update is /help — return chat/user info (resend user guide)."""
    return extract_bot_command(update, "help")
