"""Arq background tasks for reminders + scheduled notification dispatch."""

from __future__ import annotations

from typing import Any

from arq import cron
from arq.connections import RedisSettings
from loguru import logger

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.logging import setup_logging
from app.routers.notifications import dispatch_all_users
from app.services.telegram_bot import TelegramBotError, send_workout_reminder


async def send_reminder_task(
    ctx: dict[str, Any],
    *,
    telegram_id: int,
    workout_id: str,
    title: str = "Напоминание о тренировке",
) -> dict[str, Any]:
    """Arq job: send one Telegram workout reminder."""
    settings = ctx.get("settings") or get_settings()
    try:
        result = await send_workout_reminder(
            settings,
            telegram_id=telegram_id,
            workout_id=workout_id,
            title=title,
        )
        logger.info(
            "reminder_sent telegram_id={} workout_id={}",
            telegram_id,
            workout_id,
        )
        return {"ok": True, "result": result.get("result")}
    except TelegramBotError as exc:
        logger.error(
            "reminder_failed telegram_id={} workout_id={} err={}",
            telegram_id,
            workout_id,
            str(exc),
        )
        return {"ok": False, "error": str(exc)}


async def dispatch_scheduled_notifications_task(ctx: dict[str, Any]) -> dict[str, Any]:
    """Cron: every minute check measurement / workout / supplement windows."""
    settings = ctx.get("settings") or get_settings()
    async with AsyncSessionLocal() as session:
        result = await dispatch_all_users(session, settings)
    logger.info("scheduled_dispatch {}", result)
    return result


async def on_startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    setup_logging(environment=settings.environment)
    ctx["settings"] = settings
    logger.info("arq_worker_started env={}", settings.environment)


async def on_shutdown(ctx: dict[str, Any]) -> None:
    logger.info("arq_worker_stopped")


class WorkerSettings:
    """arq worker settings — run: arq app.tasks.notifications.WorkerSettings"""

    functions = [send_reminder_task, dispatch_scheduled_notifications_task]
    cron_jobs = [
        cron(dispatch_scheduled_notifications_task, minute=set(range(60)), second={0}),
    ]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
