"""Allowlisted canonical manuals shared with Telegram document delivery."""
from typing import Literal

from loguru import logger

from app.services import telegram_bot

GuideKind = Literal["user", "admin"]


class GuideUnavailableError(RuntimeError):
    pass


def load_guide(kind: GuideKind) -> tuple[str, bytes]:
    loader = telegram_bot.load_user_guide_bytes if kind == "user" else telegram_bot.load_admin_guide_bytes
    try:
        return loader()
    except (telegram_bot.TelegramBotError, OSError) as exc:
        logger.warning("guide_download_unavailable kind={} error_type={}", kind, type(exc).__name__)
        raise GuideUnavailableError("Инструкция временно недоступна. Попробуйте позже") from exc
