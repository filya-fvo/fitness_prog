"""Safely restore a stalled Telegram webhook without dropping queued updates."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from loguru import logger

from app.core.config import Settings
from app.services.telegram_bot import TelegramBotError, get_webhook_info, set_webhook

_RECENT_ERROR_SECONDS = 15 * 60


def expected_webhook_url(settings: Settings) -> str:
    """Build the configured production webhook URL without exposing secrets."""
    domain = settings.api_domain.strip().lower().rstrip("/")
    if not domain:
        return ""
    if domain.startswith("https://"):
        base = domain
    elif "://" not in domain:
        base = f"https://{domain}"
    else:
        return ""
    if "ngrok" in base or "/" in base.removeprefix("https://"):
        return ""
    return f"{base}/telegram/webhook"


def repair_reason(
    info: dict[str, Any],
    *,
    expected_url: str,
    now: datetime | None = None,
) -> str | None:
    """Return a bounded repair reason for a known-bad webhook state."""
    if str(info.get("url") or "").rstrip("/") != expected_url.rstrip("/"):
        return "url_mismatch"
    try:
        pending = max(0, int(info.get("pending_update_count") or 0))
        error_at = int(info.get("last_error_date") or 0)
    except (TypeError, ValueError):
        return None
    message = str(info.get("last_error_message") or "").strip()
    if pending == 0 or error_at <= 0 or not message:
        return None
    current = now or datetime.now(UTC)
    age_seconds = current.timestamp() - error_at
    if 0 <= age_seconds <= _RECENT_ERROR_SECONDS:
        return "recent_delivery_error"
    return None


async def repair_telegram_webhook(
    settings: Settings,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Inspect and, only when necessary, re-register the configured webhook."""
    expected_url = expected_webhook_url(settings)
    if not expected_url or not settings.telegram_webhook_secret.strip():
        return {"ok": True, "repaired": False, "skipped": "not_configured"}
    try:
        response = await asyncio.wait_for(get_webhook_info(settings), timeout=5.0)
        info = response.get("result") or {}
        if not isinstance(info, dict):
            raise TelegramBotError("Telegram returned invalid webhook info")
        reason = repair_reason(info, expected_url=expected_url, now=now)
        pending = max(0, int(info.get("pending_update_count") or 0))
        if reason is None:
            return {"ok": True, "repaired": False, "pending_updates": pending}
        await asyncio.wait_for(
            set_webhook(
                settings,
                webhook_url=expected_url,
                drop_pending=False,
            ),
            timeout=5.0,
        )
        logger.warning(
            "telegram_webhook_repaired reason={} pending_updates={}",
            reason,
            pending,
        )
        return {
            "ok": True,
            "repaired": True,
            "reason": reason,
            "pending_updates": pending,
        }
    except (TelegramBotError, TimeoutError, ValueError, TypeError) as exc:
        logger.warning("telegram_webhook_watchdog_failed error_type={}", type(exc).__name__)
        return {"ok": False, "repaired": False, "error": "telegram_unavailable"}
