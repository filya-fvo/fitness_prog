"""Telegram Bot API helpers — /start, menu Open button, reminders (TZ §7)."""

from __future__ import annotations

from typing import Any

import httpx
from loguru import logger

from app.core.config import Settings


class TelegramBotError(Exception):
    """Raised when Telegram Bot API returns an error."""


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


def mini_app_keyboard(
    *,
    bot_username: str,
    startapp: str,
    button_text: str = "Открыть тренировку",
) -> dict[str, Any]:
    """Inline keyboard with deep link into Mini App (TZ §7)."""
    username = bot_username.lstrip("@")
    url = f"https://t.me/{username}/app?startapp={startapp}"
    return {
        "inline_keyboard": [[{"text": button_text, "url": url}]],
    }


def open_web_app_keyboard(
    *,
    mini_app_url: str,
    button_text: str = "Open",
) -> dict[str, Any] | None:
    """Inline keyboard with web_app button (opens Mini App inside Telegram)."""
    url = (mini_app_url or "").strip()
    if not url.startswith("https://"):
        return None
    return {
        "inline_keyboard": [
            [{"text": button_text, "web_app": {"url": url}}],
        ],
    }


def start_welcome_text(*, first_name: str | None = None) -> str:
    name = (first_name or "").strip()
    hello = f"Привет, {name}!" if name else "Привет!"
    return (
        f"{hello}\n\n"
        "Это фитнес Mini App: программы, тренировки, питание и AI-тренер.\n\n"
        "Чтобы начать работу с приложением, нажмите кнопку <b>Open</b> "
        "(внизу чата или на кнопке под этим сообщением)."
    )


async def send_start_welcome(
    settings: Settings,
    *,
    chat_id: int,
    first_name: str | None = None,
) -> dict[str, Any]:
    """Reply to /start with instructions + Open web_app button when URL known."""
    text = start_welcome_text(first_name=first_name)
    mini_url = resolve_mini_app_url(settings)
    markup = open_web_app_keyboard(mini_app_url=mini_url, button_text="Open")
    if markup is None and settings.bot_username:
        username = settings.bot_username.lstrip("@")
        markup = {
            "inline_keyboard": [
                [{"text": "Open", "url": f"https://t.me/{username}/app"}],
            ],
        }
    return await send_message(
        settings,
        chat_id=chat_id,
        text=text,
        reply_markup=markup,
    )


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
        raise TelegramBotError(
            "MINI_APP_URL must be https://... (public front URL, e.g. ngrok)"
        )

    menu_button: dict[str, Any] = {
        "type": "web_app",
        "text": (text or "Open")[:12],
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
    text = (
        f"💪 <b>{title}</b>\n"
        "Пора тренироваться! Откройте Mini App и начните сессию."
    )
    return await send_app_notification(
        settings,
        telegram_id=telegram_id,
        title=title,
        text=text,
        startapp=f"workout_{workout_id}",
    )


async def send_app_notification(
    settings: Settings,
    *,
    telegram_id: int,
    title: str,
    text: str,
    startapp: str | None = None,
) -> dict[str, Any]:
    """Generic chat notification with optional Mini App deep link."""
    body = f"🔔 <b>{title}</b>\n{text}"
    markup = None
    mini_url = resolve_mini_app_url(settings)
    if settings.bot_username and startapp:
        markup = mini_app_keyboard(
            bot_username=settings.bot_username,
            startapp=startapp,
            button_text="Open",
        )
    elif mini_url:
        markup = open_web_app_keyboard(mini_app_url=mini_url, button_text="Open")
    elif settings.bot_username:
        markup = mini_app_keyboard(
            bot_username=settings.bot_username,
            startapp=startapp or "home",
            button_text="Open",
        )
    return await send_message(
        settings,
        chat_id=telegram_id,
        text=body,
        reply_markup=markup,
    )


def extract_start_command(update: dict[str, Any]) -> dict[str, Any] | None:
    """
    If update is a private /start message, return chat/user info.
    Otherwise None.
    """
    message = update.get("message") or update.get("edited_message")
    if not isinstance(message, dict):
        return None
    text = str(message.get("text") or "").strip()
    if not text:
        return None
    cmd = text.split()[0]
    base = cmd.split("@", 1)[0].lower()
    if base != "/start":
        return None
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if chat_id is None:
        return None
    user = message.get("from") or {}
    return {
        "chat_id": int(chat_id),
        "user_id": user.get("id"),
        "first_name": user.get("first_name") or chat.get("first_name"),
        "username": user.get("username"),
    }
