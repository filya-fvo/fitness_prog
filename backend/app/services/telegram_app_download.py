"""Private Telegram command for downloading the current Android release."""

from __future__ import annotations

import re
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from app.core.config import Settings
from app.services.telegram_bot import extract_bot_command, resolve_mini_app_url, send_message


def extract_app_command(update: dict[str, Any]) -> dict[str, Any] | None:
    """Accept /app (optionally addressed to a bot) only in a private chat."""
    message = update.get("message") or update.get("edited_message")
    if not isinstance(message, dict):
        return None
    chat = message.get("chat")
    if not isinstance(chat, dict) or chat.get("type") != "private":
        return None
    text = str(message.get("text") or "").strip()
    first = text.split(maxsplit=1)[0] if text else ""
    if not re.fullmatch(r"/app(?:@[A-Za-z0-9_]+)?", first):
        return None
    return extract_bot_command(update, "app")


def app_download_url(settings: Settings) -> str:
    """Derive the APK location from the configured public HTTPS app origin."""
    value = resolve_mini_app_url(settings)
    if not value or "\\" in value or any(char.isspace() or ord(char) < 32 for char in value):
        return ""
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        # Accessing port also rejects malformed and out-of-range values.
        _ = parsed.port
        if parsed.scheme != "https" or not host or parsed.username or parsed.password:
            return ""
        try:
            address = ip_address(host)
        except ValueError:
            if (
                "." not in host
                or host.endswith((".localhost", ".local", ".internal"))
                or not re.fullmatch(r"[A-Za-z0-9.-]+", host)
                or any(
                    not label or label.startswith("-") or label.endswith("-")
                    for label in host.split(".")
                )
            ):
                return ""
        else:
            if not address.is_global:
                return ""
        return urlunsplit(("https", parsed.netloc, "/android/latest.apk", "", ""))
    except ValueError:
        return ""


async def send_app_download(settings: Settings, *, chat_id: int) -> dict[str, Any]:
    """Send a URL button; invalid deployment configuration has no download link."""
    url = app_download_url(settings)
    if not url:
        return await send_message(
            settings,
            chat_id=chat_id,
            text="Приложение для Android готовится. Попробуйте команду /app позже.",
        )
    return await send_message(
        settings,
        chat_id=chat_id,
        text="📱 <b>FilFit для Android</b>\nСкачайте последнюю версию приложения кнопкой ниже.",
        reply_markup={
            "inline_keyboard": [[{"text": "Скачать для Android", "url": url}]],
        },
    )
