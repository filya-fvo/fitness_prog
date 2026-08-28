"""Safe real Telegram delivery smoke for one dedicated recipient only."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.services.admin_broadcasts import send_broadcast_test_message
from app.services.telegram_bot import send_app_notification, send_user_guide


async def configured_recipient(settings: Settings) -> tuple[int, User]:
    telegram_id = settings.admin_smoke_telegram_id
    if telegram_id is None:
        raise RuntimeError("ADMIN_SMOKE_TELEGRAM_ID is not configured")
    async with AsyncSessionLocal() as session:
        user = await session.scalar(
            select(User).where(
                User.telegram_id == telegram_id,
                User.is_deleted.is_(False),
            )
        )
    if user is None:
        raise RuntimeError("The configured smoke recipient is not an active application user")
    return telegram_id, user


async def send_smoke_messages(settings: Settings, telegram_id: int) -> None:
    """Send exactly three allowlisted messages to the same configured chat."""
    await send_app_notification(
        settings,
        telegram_id=telegram_id,
        title="Проверка служебного сообщения",
        text="Тестовая доставка поддержки. Действий не требуется.",
        startapp="home",
    )
    await send_user_guide(settings, chat_id=telegram_id)
    await send_broadcast_test_message(
        settings,
        telegram_id=telegram_id,
        title="Проверка тестовой рассылки",
        message="Это одиночный smoke-тест. Массовая аудитория не использовалась.",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate one dedicated Telegram smoke recipient. "
            "Real messages require --write."
        )
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="send personal, guide and broadcast-test messages only to ADMIN_SMOKE_TELEGRAM_ID",
    )
    return parser.parse_args()


async def main(args: argparse.Namespace) -> None:
    settings = get_settings()
    telegram_id, user = await configured_recipient(settings)
    print("RECIPIENT_OK", str(user.id), f"telegram=***{str(telegram_id)[-4:]}")
    if not args.write:
        print("READ_ONLY_OK; add --write to send the three smoke messages")
        return
    await send_smoke_messages(settings, telegram_id)
    print("DELIVERY_SMOKE_OK", "personal=1", "guide=1", "broadcast_test=1")


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
