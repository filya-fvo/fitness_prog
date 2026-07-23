"""Telegram Bot API helpers — reminders with Mini App deep links (TZ §7)."""

from __future__ import annotations

from typing import Any

import httpx
from loguru import logger

from app.core.config import Settings


class TelegramBotError(Exception):
    """Raised when Telegram Bot API returns an error."""


async def send_message(
    settings: Settings,
    *,
    chat_id: int,
    text: str,
    reply_markup: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """POST sendMessage to Telegram Bot API."""
    if not settings.bot_token or settings.bot_token.startswith("replace_with"):
        raise TelegramBotError("BOT_TOKEN is not configured")

    url = f"https://api.telegram.org/bot{settings.bot_token}/sendMessage"
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, json=payload)
        data = resp.json()
        if resp.status_code >= 400 or not data.get("ok"):
            logger.error(
                "telegram_send_failed status={} body={}",
                resp.status_code,
                data,
            )
            raise TelegramBotError(str(data.get("description") or resp.text))
        return data


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
    markup = None
    if settings.bot_username:
        markup = mini_app_keyboard(
            bot_username=settings.bot_username,
            startapp=f"workout_{workout_id}",
        )
    return await send_message(
        settings,
        chat_id=telegram_id,
        text=text,
        reply_markup=markup,
    )
