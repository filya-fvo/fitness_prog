"""Notification routes — reminders + user prefs + dispatch."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.notifications import ReminderRequest, ReminderResponse
from app.services import workout_service
from app.services.notification_prefs import (
    apply_state_updates,
    default_notification_settings,
    due_notifications,
    merge_notification_settings,
)
from app.services.telegram_bot import TelegramBotError, send_app_notification, send_workout_reminder

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationSettingsResponse(BaseModel):
    settings: dict[str, Any]
    defaults: dict[str, Any]


class NotificationSettingsUpdate(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


@router.get("/settings", response_model=NotificationSettingsResponse)
async def get_settings_route(user: User = Depends(get_current_user)) -> NotificationSettingsResponse:
    raw = (user.goals or {}).get("notification_settings")
    merged = merge_notification_settings(raw if isinstance(raw, dict) else None)
    return NotificationSettingsResponse(settings=merged, defaults=default_notification_settings())


@router.put("/settings", response_model=NotificationSettingsResponse)
async def put_settings_route(
    body: NotificationSettingsUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationSettingsResponse:
    merged = merge_notification_settings(body.settings)
    goals = {**(user.goals or {}), "notification_settings": merged}
    user.goals = goals
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)
    return NotificationSettingsResponse(settings=merged, defaults=default_notification_settings())


@router.post("/dispatch-due")
async def dispatch_due_for_me(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Send due notifications for current user (manual test / fallback)."""
    sent = await _dispatch_user(session, user, settings)
    return {"ok": True, "sent": sent}


@router.post("/dispatch-all")
async def dispatch_all(
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Cron/worker entry: scan users and send due chat notifications."""
    return await dispatch_all_users(session, settings)


async def dispatch_all_users(session: AsyncSession, settings: Settings) -> dict[str, Any]:
    users = list(
        await session.scalars(select(User).where(User.is_deleted.is_(False)).limit(5000))
    )
    total_sent = 0
    errors = 0
    for user in users:
        try:
            n = await _dispatch_user(session, user, settings)
            total_sent += n
        except Exception as exc:
            errors += 1
            logger.warning("dispatch_user_failed user={} err={}", user.id, exc)
    return {"ok": True, "users": len(users), "sent": total_sent, "errors": errors}


async def _dispatch_user(session: AsyncSession, user: User, settings: Settings) -> int:
    goals = user.goals or {}
    due = due_notifications(goals)
    if not due:
        return 0

    if not settings.bot_token or settings.bot_token.startswith("replace_with"):
        logger.info("notification_dry_run user={} count={}", user.id, len(due))
        user.goals = apply_state_updates(goals, due)
        flag_modified(user, "goals")
        await session.commit()
        return 0

    sent_items: list[dict[str, Any]] = []
    for item in due:
        try:
            await send_app_notification(
                settings,
                telegram_id=user.telegram_id,
                title=str(item.get("title") or "Напоминание"),
                text=str(item.get("text") or ""),
                startapp=str(item.get("startapp") or "home"),
            )
            sent_items.append(item)
        except TelegramBotError as exc:
            logger.warning(
                "notification_send_failed user={} kind={} err={}",
                user.id,
                item.get("kind"),
                exc,
            )
    if sent_items:
        user.goals = apply_state_updates(goals, sent_items)
        flag_modified(user, "goals")
        await session.commit()
    return len(sent_items)


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
        lower = detail.lower()
        code = (
            status.HTTP_400_BAD_REQUEST
            if "chat not found" in lower
            or "bot was blocked" in lower
            or "user is deactivated" in lower
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(status_code=code, detail=detail) from exc
