"""Arq background tasks for reminders + scheduled notification dispatch."""

from __future__ import annotations

from datetime import UTC, datetime
import json
import uuid
from typing import Any

from arq import cron
from arq.connections import RedisSettings
from loguru import logger
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.database import AsyncSessionLocal
from app.core.logging import setup_logging
from app.models.user import User
from app.routers.notifications import dispatch_all_users
from app.services.admin_system import NOTIFICATION_STATUS_KEY, WORKER_STATUS_KEY
from app.services.telegram_bot import TelegramBotError, send_app_notification, send_workout_reminder
from app.services.web_push import send_user_web_push


async def _record_worker_status(
    redis: Any,
    *,
    task: str,
    state: str,
    notification_result: dict[str, int] | None = None,
) -> None:
    """Publish only allowlisted operational counters; monitoring must not break a job."""
    if redis is None:
        return
    recorded_at = datetime.now(UTC).isoformat()
    try:
        await redis.set(
            WORKER_STATUS_KEY,
            json.dumps(
                {"recorded_at": recorded_at, "task": task[:80], "state": state[:32]},
                ensure_ascii=True,
            ),
        )
        if notification_result is not None:
            await redis.set(
                NOTIFICATION_STATUS_KEY,
                json.dumps(
                    {
                        "recorded_at": recorded_at,
                        "processed": max(0, int(notification_result.get("processed", 0))),
                        "sent": max(0, int(notification_result.get("sent", 0))),
                        "errors": max(0, int(notification_result.get("errors", 0))),
                    },
                    ensure_ascii=True,
                ),
            )
    except Exception as exc:
        logger.warning("worker_status_write_failed err_type={}", type(exc).__name__)


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
    redis = ctx.get("redis")
    await _record_worker_status(redis, task="Напоминание о тренировке", state="running")
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
        response = {"ok": True, "result": result.get("result")}
        await _record_worker_status(redis, task="Напоминание о тренировке", state="completed")
        return response
    except TelegramBotError as exc:
        logger.error(
            "reminder_failed telegram_id={} workout_id={} err={}",
            telegram_id,
            workout_id,
            str(exc),
        )
        await _record_worker_status(redis, task="Напоминание о тренировке", state="failed")
        return {"ok": False, "error": str(exc)}


async def dispatch_scheduled_notifications_task(ctx: dict[str, Any]) -> dict[str, Any]:
    """Cron: every minute check measurement / workout / supplement windows."""
    redis = ctx.get("redis")
    await _record_worker_status(redis, task="Проверка уведомлений", state="running")
    # Multiple ARQ processes may briefly coexist while Windows services recover.
    # Keep one dispatch for each UTC minute so reminders cannot race or fan out.
    if not await _claim_dispatch_minute(redis):
        await _record_worker_status(redis, task="Проверка уведомлений", state="completed")
        return {"ok": True, "skipped": "already_dispatched"}
    settings = notification_settings()
    try:
        async with AsyncSessionLocal() as session:
            result = await dispatch_all_users(session, settings)
    except Exception:
        await _record_worker_status(redis, task="Проверка уведомлений", state="failed")
        raise
    await _record_worker_status(
        redis,
        task="Проверка уведомлений",
        state="completed" if not result.get("errors") else "completed_with_errors",
        notification_result={
            "processed": int(result.get("users", 0)),
            "sent": int(result.get("sent", 0)),
            "errors": int(result.get("errors", 0)),
        },
    )
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
    redis = ctx.get("redis")
    await _record_worker_status(redis, task="Завершение таймера", state="running")
    settings = notification_settings()
    async with AsyncSessionLocal() as session:
        user = await session.scalar(
            select(User).where(User.id == uuid.UUID(user_id), User.is_deleted.is_(False))
        )
        if user is None:
            await _record_worker_status(redis, task="Завершение таймера", state="failed")
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
    await _record_worker_status(
        redis,
        task="Завершение таймера",
        state="completed" if delivered > 0 else "failed",
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
    await _record_worker_status(ctx.get("redis"), task="Запуск worker", state="started")
    logger.info("arq_worker_started env={}", settings.environment)


async def on_shutdown(ctx: dict[str, Any]) -> None:
    await _record_worker_status(ctx.get("redis"), task="Остановка worker", state="stopped")
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
