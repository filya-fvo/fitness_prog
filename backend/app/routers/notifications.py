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
from app.schemas.notifications import (
    ReminderRequest,
    ReminderResponse,
    TimerNotifyRequest,
    TimerNotifyResponse,
)
from app.services import workout_service
from app.services import nutrition_service
from app.services.energy_targets import compute_energy_targets
from app.services.notification_prefs import (
    apply_state_updates,
    default_notification_settings,
    due_notifications,
    format_calorie_reminder_text,
    merge_notification_settings,
    set_water_ml_for_day,
    water_ml_for_day,
)
from app.services.telegram_bot import TelegramBotError, send_app_notification, send_workout_reminder

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationSettingsResponse(BaseModel):
    settings: dict[str, Any]
    defaults: dict[str, Any]


class NotificationSettingsUpdate(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class WaterLogBody(BaseModel):
    """Sync daily water intake (ml) for bot reminders."""

    ml: int = Field(..., ge=0, le=20000)
    date: str | None = None
    mode: str = Field(default="set", description="set | add")



class WaterLogResponse(BaseModel):
    date: str
    ml: int
    daily_target_ml: int | None = None


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


@router.get("/water", response_model=WaterLogResponse)
async def get_water_log(
    date_value: str | None = None,
    user: User = Depends(get_current_user),
) -> WaterLogResponse:
    from datetime import date as date_cls

    day = date_cls.fromisoformat(date_value) if date_value else date_cls.today()
    goals = user.goals or {}
    ml = water_ml_for_day(goals, day)
    nset = merge_notification_settings(
        goals.get("notification_settings")
        if isinstance(goals.get("notification_settings"), dict)
        else None
    )
    wcfg = nset.get("water") or {}
    target = None
    try:
        if wcfg.get("enabled"):
            target = int(wcfg.get("daily_ml") or 2500)
    except (TypeError, ValueError):
        target = 2500
    return WaterLogResponse(date=day.isoformat(), ml=ml, daily_target_ml=target)


@router.put("/water", response_model=WaterLogResponse)
async def put_water_log(
    body: WaterLogBody,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WaterLogResponse:
    from datetime import date as date_cls

    day = date_cls.fromisoformat(body.date) if body.date else date_cls.today()
    goals = dict(user.goals or {})
    current = water_ml_for_day(goals, day)
    if (body.mode or "set").lower() == "add":
        new_ml = current + int(body.ml)
    else:
        new_ml = int(body.ml)
    goals = set_water_ml_for_day(goals, day, new_ml)
    user.goals = goals
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)
    nset = merge_notification_settings(
        goals.get("notification_settings")
        if isinstance(goals.get("notification_settings"), dict)
        else None
    )
    wcfg = nset.get("water") or {}
    target = None
    try:
        if wcfg.get("enabled"):
            target = int(wcfg.get("daily_ml") or 2500)
    except (TypeError, ValueError):
        target = 2500
    return WaterLogResponse(
        date=day.isoformat(),
        ml=water_ml_for_day(goals, day),
        daily_target_ml=target,
    )


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


async def _enrich_due_item(session: AsyncSession, user: User, item: dict[str, Any]) -> dict[str, Any]:
    """Fill dynamic text for calories (and keep water as-is)."""
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    if item.get("kind") != "calories" and not meta.get("needs_calorie_context"):
        return item
    from datetime import date as date_cls

    day = date_cls.today()
    try:
        _logs, totals = await nutrition_service.daily_summary(session, user, day)
        eaten = float((totals or {}).get("calories") or 0)
    except Exception as exc:
        logger.warning("calorie_context_failed user={} err={}", user.id, exc)
        eaten = 0.0
    targets = compute_energy_targets(user.anthropometry or {}, user.goals or {})
    target = None
    if targets.get("complete") and targets.get("calories_target") is not None:
        try:
            target = float(targets["calories_target"])
        except (TypeError, ValueError):
            target = None
    slot = str(meta.get("slot") or "")
    out = dict(item)
    out["text"] = format_calorie_reminder_text(eaten=eaten, target=target, slot=slot or "сейчас")
    return out


async def _dispatch_user(session: AsyncSession, user: User, settings: Settings) -> int:
    """Claim due marks first, then send — prevents duplicate spam on restart."""
    goals = user.goals or {}
    due = due_notifications(goals)
    if not due:
        return 0

    # Claim immediately so a second worker tick / restart cannot re-send the same slots.
    user.goals = apply_state_updates(goals, due)
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)

    enriched: list[dict[str, Any]] = []
    for item in due:
        enriched.append(await _enrich_due_item(session, user, item))

    if not settings.bot_token or settings.bot_token.startswith("replace_with"):
        logger.info("notification_dry_run user={} count={}", user.id, len(enriched))
        return 0

    if user.telegram_id is None:
        logger.info("notification_skip_no_telegram user={} count={}", user.id, len(enriched))
        return 0

    sent = 0
    for item in enriched:
        try:
            await send_app_notification(
                settings,
                telegram_id=int(user.telegram_id),
                title=str(item.get("title") or "Напоминание"),
                text=str(item.get("text") or ""),
                startapp=str(item.get("startapp") or "home"),
            )
            sent += 1
        except TelegramBotError as exc:
            logger.warning(
                "notification_send_failed user={} kind={} err={}",
                user.id,
                item.get("kind"),
                exc,
            )
    return sent


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

    if user.telegram_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У аккаунта нет Telegram — напоминания в бот недоступны",
        )

    if body.enqueue:
        try:
            from arq import create_pool
            from arq.connections import RedisSettings

            redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
            try:
                job = await redis.enqueue_job(
                    "send_reminder_task",
                    telegram_id=int(user.telegram_id),
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
            telegram_id=int(user.telegram_id),
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


@router.post("/timer-ended", response_model=TimerNotifyResponse)
async def timer_ended_notify(
    body: TimerNotifyRequest,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> TimerNotifyResponse:
    """Push a short Telegram message when in-app rest/hold timer finishes."""
    if user.telegram_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У аккаунта нет Telegram — уведомление в бот недоступно",
        )
    title = (body.title or ("Отдых завершён" if body.kind == "rest" else "Таймер")).strip()
    text = body.text.strip()
    startapp = (body.startapp or "home").strip() or "home"
    if body.workout_id and startapp == "home":
        startapp = f"workout_{body.workout_id}"
    try:
        await send_app_notification(
            settings,
            telegram_id=int(user.telegram_id),
            title=title,
            text=text,
            startapp=startapp,
        )
    except TelegramBotError as exc:
        logger.warning("timer_notify_failed user={} err={}", user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Не удалось отправить в Telegram: {exc}",
        ) from exc
    return TimerNotifyResponse(ok=True, detail="sent")

