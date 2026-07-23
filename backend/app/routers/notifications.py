"""Notification routes — enqueue/send workout reminders."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.notifications import ReminderRequest, ReminderResponse
from app.services import workout_service
from app.services.telegram_bot import TelegramBotError, send_workout_reminder

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/reminders", response_model=ReminderResponse)
async def create_reminder(
    body: ReminderRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ReminderResponse:
    """Send or enqueue a Telegram reminder for a user's workout."""
    workout = await workout_service.get_workout(session, user, body.workout_id)
    title = body.title or "Напоминание о тренировке"

    # Prefer queue when requested
    if body.enqueue:
        try:
            from arq import create_pool
            from arq.connections import RedisSettings

            redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
            try:
                job = await redis.enqueue_job(
                    "send_reminder_task",
                    telegram_id=user.telegram_id,
                    workout_id=str(workout.id),
                    title=title,
                )
                logger.info(
                    "reminder_enqueued user={} workout={} job={}",
                    user.id,
                    workout.id,
                    getattr(job, "job_id", None),
                )
                return ReminderResponse(
                    ok=True,
                    mode="queued",
                    detail=str(getattr(job, "job_id", "enqueued")),
                )
            finally:
                await redis.close()
        except Exception as exc:
            logger.warning("reminder_queue_unavailable err={}", str(exc))
            # fall through to inline send

    # Dry-run in dev without real bot token
    if not settings.bot_token or settings.bot_token.startswith("replace_with"):
        logger.info(
            "reminder_dry_run telegram_id={} workout_id={}",
            user.telegram_id,
            workout.id,
        )
        return ReminderResponse(
            ok=True,
            mode="dry_run",
            detail="BOT_TOKEN not set — reminder not sent",
        )

    try:
        await send_workout_reminder(
            settings,
            telegram_id=user.telegram_id,
            workout_id=str(workout.id),
            title=title,
        )
        return ReminderResponse(ok=True, mode="inline")
    except TelegramBotError as exc:
        detail = str(exc)
        # User never started the bot / invalid chat → client error, not upstream outage
        lower = detail.lower()
        code = (
            status.HTTP_400_BAD_REQUEST
            if "chat not found" in lower or "bot was blocked" in lower or "user is deactivated" in lower
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(status_code=code, detail=detail) from exc
