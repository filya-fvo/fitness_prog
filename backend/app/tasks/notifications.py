"""Arq background tasks for reminders + scheduled notification dispatch."""

from __future__ import annotations

from datetime import UTC, datetime
import uuid
from typing import Any

from arq import cron
from arq.connections import RedisSettings
from loguru import logger

from app.core.config import Settings, get_settings
from app.core.database import AsyncSessionLocal
from app.core.logging import setup_logging
from app.models.user import User
from app.routers.notifications import dispatch_all_users
from app.services.telegram_bot import TelegramBotError, send_app_notification, send_workout_reminder
from app.services.web_push import send_user_web_push
from sqlalchemy import select


def notification_settings() -> Settings:
    """Reload .env so a long-lived worker never sends buttons with an obsolete URL."""
    return Settings()


async def _claim_dispatch_minute(redis: Any, now: datetime | None = None) -> bool:
    """Allow only one scheduled dispatch across all worker processes per minute."""
    if redis is None:
        return True
    minute = (now or datetime.now(UTC)).strftime("%Y%m%d%H%M")
    return bool(
        await redis.set(
            f"fitness:notifications:dispatch:{minute}",
            uuid.uuid4().hex,
            nx=True,
            ex=180,
        )
    )


async def send_reminder_task(
    ctx: dict[str, Any],
    *,
    telegram_id: int,
    workout_id: str,
    title: str = "Напоминание о тренировке",
) -> dict[str, Any]:
    """Arq job: send one Telegram workout reminder."""
    settings = notification_settings()
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
    # Multiple ARQ processes may briefly coexist while Windows services recover.
    # Keep one dispatch for each UTC minute so reminders cannot race or fan out.
    if not await _claim_dispatch_minute(ctx.get("redis")):
        return {"ok": True, "skipped": "already_dispatched"}
    settings = notification_settings()
    async with AsyncSessionLocal() as session:
        result = await dispatch_all_users(session, settings)
    logger.info("scheduled_dispatch {}", result)
    return result


async def send_timer_finished_task(
    ctx: dict[str, Any],
    *,
    user_id: str,
    title: str,
    text: str,
    workout_id: str | None = None,
) -> dict[str, Any]:
    """Deliver a finished timer even when the Mini App has been fully closed."""
    settings = notification_settings()
    async with AsyncSessionLocal() as session:
        user = await session.scalar(
            select(User).where(User.id == uuid.UUID(user_id), User.is_deleted.is_(False))
        )
        if user is None:
            return {"ok": False, "detail": "user_not_found"}
        delivered = 0
        if user.telegram_id is not None:
            try:
                await send_app_notification(
                    settings,
                    telegram_id=int(user.telegram_id),
                    title=title,
                    text=text,
                    startapp=f"workout_{workout_id}" if workout_id else "home",
                )
                delivered += 1
            except TelegramBotError as exc:
                logger.warning("timer_telegram_failed user={} err={}", user.id, exc)
        delivered += await send_user_web_push(
            session,
            settings,
            user_id=user.id,
            title=title,
            body=text,
            url=f"/workouts/active/{workout_id}" if workout_id else "/",
            tag=f"rest-timer-{workout_id or 'active'}",
        )
    return {"ok": delivered > 0, "delivered": delivered}


async def on_startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    setup_logging(
        environment=settings.environment,
        service="worker",
        log_dir=settings.log_dir or None,
        keep_archive_days=settings.log_archive_days,
    )
    ctx["settings"] = settings
    logger.info("arq_worker_started env={}", settings.environment)


async def on_shutdown(ctx: dict[str, Any]) -> None:
    logger.info("arq_worker_stopped")


class WorkerSettings:
    """arq worker settings — run: arq app.tasks.notifications.WorkerSettings"""

    functions = [send_reminder_task, dispatch_scheduled_notifications_task, send_timer_finished_task]
    cron_jobs = [
        cron(dispatch_scheduled_notifications_task, minute=set(range(60)), second={0}),
    ]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
