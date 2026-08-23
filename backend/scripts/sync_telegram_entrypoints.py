"""Synchronize default and per-chat Telegram Mini App entry points."""

from __future__ import annotations

import argparse
import asyncio
from urllib.parse import urlparse

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.services.telegram_bot import (
    get_webhook_info,
    open_app_markup,
    send_message,
    send_start_welcome,
    set_default_chat_menu_button,
    set_webhook,
)


def safe_public_url(raw: str) -> str:
    value = (raw or "").strip().rstrip("/")
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        raise RuntimeError("MINI_APP_URL must be a valid HTTPS URL")
    if "ngrok" in host:
        raise RuntimeError("ngrok URL is forbidden; configure Tailscale Funnel or a permanent host")
    return value


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--send-open-to", action="append", type=int, default=[])
    parser.add_argument(
        "--send-welcome-all",
        action="store_true",
        help="send a fresh /start-equivalent welcome and persistent keyboard to all users",
    )
    parser.add_argument(
        "--webhook-base",
        default="",
        help="public API origin; registers <origin>/telegram/webhook",
    )
    args = parser.parse_args()

    settings = get_settings()
    public_url = safe_public_url(settings.mini_app_url)
    await set_default_chat_menu_button(settings)

    async with AsyncSessionLocal() as session:
        telegram_ids = [
            int(item)
            for item in (
                await session.scalars(
                    select(User.telegram_id).where(
                        User.telegram_id.is_not(None),
                        User.is_deleted.is_(False),
                    )
                )
            ).all()
        ]

    updated = 0
    failed: list[int] = []
    for telegram_id in telegram_ids:
        try:
            await set_default_chat_menu_button(settings, chat_id=telegram_id)
            updated += 1
        except Exception:  # noqa: BLE001 - continue syncing other chats
            failed.append(telegram_id)

    known = set(telegram_ids)
    for telegram_id in dict.fromkeys(args.send_open_to):
        if telegram_id not in known:
            raise RuntimeError(f"Telegram ID {telegram_id} is not linked to an app user")
        await send_message(
            settings,
            chat_id=telegram_id,
            text=(
                "✅ <b>Адрес Fitness Mini App обновлён.</b>\n"
                "Используйте кнопку <b>Open</b> под этим сообщением. "
                "Старые кнопки могут вести на отключённый адрес."
            ),
            reply_markup=open_app_markup(settings),
        )

    welcome_sent = 0
    welcome_failed = 0
    if args.send_welcome_all:
        for telegram_id in telegram_ids:
            try:
                await send_start_welcome(
                    settings,
                    chat_id=telegram_id,
                    first_name=None,
                    send_full_guide=False,
                )
                welcome_sent += 1
            except Exception:  # noqa: BLE001 - one blocked chat must not stop broadcast
                welcome_failed += 1
            # Keep broadcasts comfortably below Telegram's free limits.
            await asyncio.sleep(0.1)

    print(f"URL={public_url}")
    print("DEFAULT_MENU=standard")
    print(f"CHAT_MENUS_UPDATED={updated}")
    print(f"CHAT_MENUS_FAILED={len(failed)}")
    if args.webhook_base:
        webhook_base = safe_public_url(args.webhook_base)
        webhook_url = f"{webhook_base}/telegram/webhook"
        await set_webhook(settings, webhook_url=webhook_url)
        info = (await get_webhook_info(settings)).get("result") or {}
        actual_url = str(info.get("url") or "").rstrip("/")
        if actual_url != webhook_url:
            raise RuntimeError(f"Telegram returned unexpected webhook URL: {actual_url!r}")
        print(f"WEBHOOK={actual_url}")
        print(f"WEBHOOK_PENDING={int(info.get('pending_update_count') or 0)}")
        print(f"WEBHOOK_LAST_ERROR={str(info.get('last_error_message') or '')}")
    if args.send_welcome_all:
        print(f"WELCOME_SENT={welcome_sent}")
        print(f"WELCOME_FAILED={welcome_failed}")


if __name__ == "__main__":
    asyncio.run(main())
