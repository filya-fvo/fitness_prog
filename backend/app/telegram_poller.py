"""Reliable Telegram update ingress for production Compose.

Telegram could not consistently open the public VPS webhook, while outbound
IPv6 access from the VPS is available. This process receives updates by long
polling and delivers them to the existing API over Docker's private network.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import httpx
from loguru import logger
from redis.asyncio import Redis

from app.core.config import Settings, get_settings
from app.core.logging import setup_logging
from app.services.telegram_bot import TelegramBotError, delete_webhook, get_updates

POLLER_STATUS_KEY = "fitness:admin:telegram-poller:heartbeat"
_INTERNAL_WEBHOOK_URL = "http://api:8000/telegram/webhook"


async def _record_status(
    redis: Redis,
    *,
    state: str,
    update_id: int | None = None,
) -> None:
    payload: dict[str, Any] = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "state": state[:32],
    }
    if update_id is not None:
        payload["last_update_id"] = update_id
    try:
        await redis.set(POLLER_STATUS_KEY, json.dumps(payload), ex=120)
    except Exception as exc:  # noqa: BLE001 - telemetry must not stop update delivery
        logger.warning("telegram_poller_status_failed error_type={}", type(exc).__name__)


async def _disable_webhook(settings: Settings) -> None:
    await delete_webhook(settings, drop_pending=False)
    logger.info("telegram_poller_webhook_disabled pending_updates_preserved=true")


async def _dispatch_update(
    client: httpx.AsyncClient,
    settings: Settings,
    update: dict[str, Any],
) -> bool:
    try:
        response = await client.post(
            _INTERNAL_WEBHOOK_URL,
            json=update,
            headers={
                "X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret,
            },
        )
    except httpx.HTTPError as exc:
        logger.warning("telegram_poller_dispatch_failed error_type={}", type(exc).__name__)
        return False
    if response.is_success:
        return True
    logger.warning("telegram_poller_dispatch_status status={}", response.status_code)
    return False


def _update_id(update: dict[str, Any]) -> int | None:
    value = update.get("update_id")
    return value if isinstance(value, int) and value >= 0 else None


async def run_poller(settings: Settings | None = None) -> None:
    current = settings or get_settings()
    if current.telegram_update_mode != "polling":
        raise RuntimeError("Telegram poller requires TELEGRAM_UPDATE_MODE=polling")
    if not current.telegram_webhook_secret.strip():
        raise RuntimeError("Telegram poller requires TELEGRAM_WEBHOOK_SECRET")

    redis = Redis.from_url(
        current.redis_url,
        decode_responses=True,
        socket_connect_timeout=2.0,
        socket_timeout=2.0,
    )
    offset: int | None = None
    backoff_seconds = 0.5
    webhook_disabled = False
    async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=3.0)) as client:
        try:
            while True:
                if not webhook_disabled:
                    try:
                        await _disable_webhook(current)
                        webhook_disabled = True
                        backoff_seconds = 0.5
                    except TelegramBotError as exc:
                        logger.warning(
                            "telegram_poller_setup_failed error_type={}",
                            type(exc).__name__,
                        )
                        await _record_status(redis, state="telegram_unavailable")
                        await asyncio.sleep(backoff_seconds)
                        backoff_seconds = min(10.0, backoff_seconds * 2)
                        continue

                try:
                    updates = await get_updates(
                        current,
                        offset=offset,
                        limit=1,
                        timeout_seconds=25,
                    )
                except TelegramBotError as exc:
                    # A webhook may have been restored manually while this service
                    # is active. Disable it again without dropping queued actions.
                    if "webhook" in str(exc).casefold():
                        webhook_disabled = False
                    logger.warning(
                        "telegram_poller_receive_failed error_type={}",
                        type(exc).__name__,
                    )
                    await _record_status(redis, state="telegram_unavailable")
                    await asyncio.sleep(backoff_seconds)
                    backoff_seconds = min(10.0, backoff_seconds * 2)
                    continue

                await _record_status(redis, state="waiting")
                backoff_seconds = 0.5
                if not updates:
                    continue
                update = updates[0]
                update_id = _update_id(update)
                if update_id is None:
                    logger.warning("telegram_poller_invalid_update")
                    continue
                if not await _dispatch_update(client, current, update):
                    await _record_status(redis, state="dispatch_failed", update_id=update_id)
                    await asyncio.sleep(backoff_seconds)
                    backoff_seconds = min(10.0, backoff_seconds * 2)
                    continue
                # Telegram confirms this update on the next getUpdates call. A
                # possible replay after a crash remains safe for idempotent actions.
                offset = update_id + 1
                await _record_status(redis, state="processed", update_id=update_id)
                logger.info("telegram_update_processed update_id={}", update_id)
        finally:
            await redis.aclose()


def main() -> None:
    settings = get_settings()
    setup_logging(
        environment=settings.environment,
        service="telegram-poller",
        log_dir=settings.log_dir or None,
        keep_archive_days=settings.log_archive_days,
    )
    logger.info("telegram_poller_started mode={}", settings.telegram_update_mode)
    asyncio.run(run_poller(settings))


if __name__ == "__main__":
    main()
