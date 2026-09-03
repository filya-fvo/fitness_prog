"""Notification routes — reminders + user prefs + dispatch."""

from __future__ import annotations

import asyncio
from datetime import UTC, date as date_cls, datetime
from typing import Any, Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user, require_admin
from app.models.user import User
from app.models.supplement_intake import WebPushSubscription
from app.schemas.notifications import (
    ReminderRequest,
    ReminderResponse,
    TimerNotifyRequest,
    TimerNotifyResponse,
    TimerScheduleRequest,
)
from app.services import (
    nutrition_service,
    scheduler as scheduler_service,
    supplement_intakes,
    workout_notifications,
    workout_service,
)
from app.services.energy_targets import compute_energy_targets
from app.services.notification_prefs import (
    apply_state_updates,
    default_notification_settings,
    due_notifications,
    format_calorie_reminder_text,
    local_now,
    merge_notification_settings,
    set_water_ml_for_day,
    water_ml_for_day,
)
from app.services.telegram_bot import (
    TelegramBotError,
    send_app_notification,
    send_message,
    send_workout_reminder,
    supplement_intake_keyboard,
)
from app.services.web_push import send_user_web_push

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _timer_job_id(user_id: Any, workout_id: Any = None) -> str:
    return f"rest-timer:{user_id}:{workout_id or 'active'}:{uuid.uuid4().hex}"


def _timer_job_ref(user_id: Any, workout_id: Any = None) -> str:
    return f"rest-timer-ref:{user_id}:{workout_id or 'active'}"


async def _acquire_timer_lock(redis: Any, ref_key: str) -> tuple[str, str]:
    lock_key = f"{ref_key}:lock"
    token = uuid.uuid4().hex
    for _ in range(20):
        if await redis.set(lock_key, token, nx=True, px=10_000):
            return lock_key, token
        await asyncio.sleep(0.05)
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Таймер уже изменяется. Повторите запрос.",
    )


async def _release_timer_lock(redis: Any, lock_key: str, token: str) -> None:
    await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then "
        "return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lock_key,
        token,
    )


async def _request_timer_abort(job: Any) -> None:
    """Signal cancellation without making a new timer wait for a busy worker."""
    try:
        await job.abort(timeout=0.05, poll_delay=0.01)
    except TimeoutError:
        # ARQ has already written the abort marker. A busy worker will observe it
        # later; the replacement timer can be enqueued immediately.
        logger.info("timer_abort_requested job={}", job.job_id)


class NotificationSettingsResponse(BaseModel):
    settings: dict[str, Any]
    defaults: dict[str, Any]


class NotificationSettingsUpdate(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class WaterLogBody(BaseModel):
    """Sync daily water intake (ml) for bot reminders."""

    ml: int = Field(..., ge=0, le=20000)
    date: date_cls | None = None
    mode: Literal["set", "add"] = "set"



class WaterLogResponse(BaseModel):
    date: str
    ml: int
    daily_target_ml: int | None = None


def _merged_notification_settings(goals: dict[str, Any]) -> dict[str, Any]:
    raw = goals.get("notification_settings")
    return merge_notification_settings(raw if isinstance(raw, dict) else None)


def _water_day(goals: dict[str, Any], requested: date_cls | None) -> date_cls:
    if requested is not None:
        return requested
    settings = _merged_notification_settings(goals)
    return local_now(str(settings.get("timezone") or "Europe/Moscow")).date()


def _water_target(goals: dict[str, Any]) -> int | None:
    wcfg = _merged_notification_settings(goals).get("water") or {}
    try:
        return int(wcfg.get("daily_ml") or 2500) if wcfg.get("enabled") else None
    except (TypeError, ValueError):
        return 2500


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=512)


class PushSubscriptionBody(BaseModel):
    endpoint: str = Field(min_length=8, max_length=4096)
    keys: PushKeys
    user_agent: str | None = Field(default=None, max_length=1000)

    @field_validator("endpoint")
    @classmethod
    def endpoint_must_be_https(cls, value: str) -> str:
        if not value.startswith("https://"):
            raise ValueError("push endpoint must use HTTPS")
        return value


class PushConfigResponse(BaseModel):
    enabled: bool
    public_key: str
    subscriptions: int


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


@router.get("/push/config", response_model=PushConfigResponse)
async def get_push_config(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PushConfigResponse:
    subscriptions = len(
        list(
            await session.scalars(
                select(WebPushSubscription).where(
                    WebPushSubscription.user_id == user.id,
                    WebPushSubscription.disabled_at.is_(None),
                    WebPushSubscription.is_deleted.is_(False),
                )
            )
        )
    )
    public_key = settings.web_push_vapid_public_key.strip()
    return PushConfigResponse(
        enabled=bool(public_key and settings.web_push_vapid_private_key.strip()),
        public_key=public_key,
        subscriptions=subscriptions,
    )


@router.post("/push/subscriptions", response_model=PushConfigResponse)
async def save_push_subscription(
    body: PushSubscriptionBody,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PushConfigResponse:
    if not settings.web_push_vapid_public_key or not settings.web_push_vapid_private_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Фоновые уведомления браузера ещё не настроены администратором",
        )
    values = {
        "user_id": user.id,
        "endpoint": body.endpoint,
        "p256dh": body.keys.p256dh,
        "auth": body.keys.auth,
        "user_agent": body.user_agent,
        "failure_count": 0,
        "disabled_at": None,
        "is_deleted": False,
    }
    statement = insert(WebPushSubscription).values(**values)
    statement = statement.on_conflict_do_update(
        index_elements=[WebPushSubscription.endpoint],
        set_=values,
    )
    await session.execute(statement)
    await session.commit()
    return await get_push_config(session, user, settings)


@router.delete("/push/subscriptions")
async def delete_push_subscription(
    endpoint: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    row = await session.scalar(
        select(WebPushSubscription).where(
            WebPushSubscription.user_id == user.id,
            WebPushSubscription.endpoint == endpoint,
            WebPushSubscription.is_deleted.is_(False),
        )
    )
    if row is not None:
        row.disabled_at = datetime.now(UTC)
        await session.commit()
    return {"ok": True}


@router.get("/water", response_model=WaterLogResponse)
async def get_water_log(
    date_value: date_cls | None = Query(default=None, alias="date"),
    user: User = Depends(get_current_user),
) -> WaterLogResponse:
    goals = dict(user.goals or {})
    day = _water_day(goals, date_value)
    ml = water_ml_for_day(goals, day)
    return WaterLogResponse(
        date=day.isoformat(),
        ml=ml,
        daily_target_ml=_water_target(goals),
    )


@router.put("/water", response_model=WaterLogResponse)
async def put_water_log(
    body: WaterLogBody,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WaterLogResponse:
    # Water is stored in the user's JSON goals. Serialize writes for one user so
    # rapid taps (and Telegram callbacks) cannot overwrite a newer total.
    locked_user = await session.scalar(
        select(User)
        .where(User.id == user.id, User.is_deleted.is_(False))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    goals = dict(locked_user.goals or {})
    day = _water_day(goals, body.date)
    current = water_ml_for_day(goals, day)
    if body.mode == "add":
        new_ml = current + int(body.ml)
    else:
        new_ml = int(body.ml)
    goals = set_water_ml_for_day(goals, day, new_ml)
    locked_user.goals = goals
    flag_modified(locked_user, "goals")
    await session.commit()
    return WaterLogResponse(
        date=day.isoformat(),
        ml=water_ml_for_day(goals, day),
        daily_target_ml=_water_target(goals),
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
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    """Admin-only HTTP trigger; the worker calls dispatch_all_users directly."""
    return await dispatch_all_users(session, settings)


async def dispatch_all_users(session: AsyncSession, settings: Settings) -> dict[str, Any]:
    total_sent = 0
    errors = 0
    processed = 0
    last_id = None
    batch_size = 500
    while True:
        statement = select(User).where(User.is_deleted.is_(False))
        if last_id is not None:
            statement = statement.where(User.id > last_id)
        batch = list(
            await session.scalars(statement.order_by(User.id).limit(batch_size))
        )
        if not batch:
            break
        for user in batch:
            try:
                n = await _dispatch_user(session, user, settings)
                total_sent += n
            except Exception as exc:
                errors += 1
                logger.warning("dispatch_user_failed user={} err={}", user.id, exc)
            processed += 1
        last_id = batch[-1].id
    return {"ok": True, "users": processed, "sent": total_sent, "errors": errors}


async def _enrich_due_item(session: AsyncSession, user: User, item: dict[str, Any]) -> dict[str, Any]:
    """Fill dynamic text for calories (and keep water as-is)."""
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    if item.get("kind") == "workout":
        previous_title = str(meta.get("workout_title") or "Тренировка")
        if previous_title != "Тренировка" and not previous_title.startswith("День "):
            return item
        _program_id, _day_index, resolved_title = await scheduler_service.active_program_snapshot(
            session,
            user,
        )
        out = dict(item)
        out["text"] = str(item.get("text") or "").replace(previous_title, resolved_title)
        out["meta"] = {**meta, "workout_title": resolved_title}
        return out
    if item.get("kind") != "calories" and not meta.get("needs_calorie_context"):
        return item
    notification_settings = _merged_notification_settings(dict(user.goals or {}))
    day = local_now(str(notification_settings.get("timezone") or "Europe/Moscow")).date()
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
    """Dispatch legacy reminders plus idempotent supplement intake groups."""
    goals = user.goals or {}
    due = [
        item
        for item in due_notifications(goals)
        if item.get("kind") not in {"supplement", "workout"}
    ]
    workout_due = workout_notifications.due_workout_notification(goals)
    if workout_due is not None:
        due.append(workout_due)

    enriched: list[dict[str, Any]] = []
    for item in due:
        enriched.append(await _enrich_due_item(session, user, item))

    sent = 0
    delivered_due: list[dict[str, Any]] = []
    for item in enriched:
        delivered = 0
        if user.telegram_id is not None and settings.bot_token and not settings.bot_token.startswith(
            "replace_with"
        ):
            try:
                await send_app_notification(
                    settings,
                    telegram_id=int(user.telegram_id),
                    title=str(item.get("title") or "Напоминание"),
                    text=str(item.get("text") or ""),
                    startapp=str(item.get("startapp") or "home"),
                    water_add_ml=250 if item.get("kind") == "water" else None,
                    button_text=(
                        "Открыть тренировку"
                        if item.get("kind") == "workout"
                        else "Открыть приложение"
                    ),
                )
                delivered += 1
            except TelegramBotError as exc:
                logger.warning(
                    "notification_send_failed user={} kind={} err={}",
                    user.id,
                    item.get("kind"),
                    exc,
                )
        delivered += await send_user_web_push(
            session,
            settings,
            user_id=user.id,
            title=str(item.get("title") or "Напоминание"),
            body=str(item.get("text") or "").replace("<b>", "").replace("</b>", ""),
            url=f"/?startapp={item.get('startapp') or 'home'}",
            tag=f"fitness-{item.get('kind') or 'reminder'}",
        )
        if delivered:
            sent += delivered
            delivered_due.append(item)

    # A reminder becomes complete only after at least one channel accepted it.
    # Otherwise catch-up must retry it when DNS/Internet/Tailscale recovers.
    if delivered_due:
        user.goals = apply_state_updates(user.goals or goals, delivered_due)
        flag_modified(user, "goals")
        await session.commit()
        await session.refresh(user)

    for group in await supplement_intakes.due_groups(session, user):
        lines = [
            f"{index}. <b>{row.name_ru}</b>" + (f" — {row.dose}" if row.dose else "")
            for index, row in enumerate(group, start=1)
        ]
        text = "Добавки на сейчас:\n" + "\n".join(lines)
        delivered = 0
        if user.telegram_id is not None and settings.bot_token and not settings.bot_token.startswith(
            "replace_with"
        ):
            try:
                await send_message(
                    settings,
                    chat_id=int(user.telegram_id),
                    text=f"💊 <b>Добавки</b>\n{text}",
                    reply_markup=supplement_intake_keyboard(
                        [(str(row.id), row.name_ru) for row in group]
                    ),
                )
                delivered += 1
            except TelegramBotError as exc:
                logger.warning("supplement_telegram_failed user={} err={}", user.id, exc)
        delivered += await send_user_web_push(
            session,
            settings,
            user_id=user.id,
            title="Пора принять добавки",
            body="; ".join(
                row.name_ru + (f" — {row.dose}" if row.dose else "") for row in group
            ),
            url="/profile?section=supplements",
            tag=f"supplements-{group[0].scheduled_at.isoformat()}",
        )
        if delivered:
            await supplement_intakes.claim_notified(session, group)
            sent += delivered
        else:
            logger.info("supplement_notification_no_channel user={} count={}", user.id, len(group))
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
            detail="Токен Telegram-бота не настроен — напоминание не отправлено",
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
    return TimerNotifyResponse(ok=True, detail="Отправлено")


@router.post("/timer/schedule", response_model=TimerNotifyResponse)
async def schedule_timer_notification(
    body: TimerScheduleRequest,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> TimerNotifyResponse:
    """Schedule delivery so closing or suspending the PWA cannot stop the timer."""
    from arq import create_pool
    from arq.connections import RedisSettings
    from arq.jobs import Job

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    ref_key = _timer_job_ref(user.id, body.workout_id)
    job_id = _timer_job_id(user.id, body.workout_id)
    lock_key = ""
    lock_token = ""
    try:
        lock_key, lock_token = await _acquire_timer_lock(redis, ref_key)
        previous = await redis.get(ref_key)
        if previous:
            await _request_timer_abort(
                Job(previous.decode() if isinstance(previous, bytes) else str(previous), redis)
            )
        await redis.enqueue_job(
            "send_timer_finished_task",
            user_id=str(user.id),
            title=body.title,
            text=body.text,
            workout_id=str(body.workout_id) if body.workout_id else None,
            _job_id=job_id,
            _defer_by=body.seconds,
        )
        await redis.set(ref_key, job_id, ex=body.seconds + 3600)
    finally:
        if lock_key:
            await _release_timer_lock(redis, lock_key, lock_token)
        await redis.close()
    return TimerNotifyResponse(ok=True, detail="Запланировано")


@router.delete("/timer/schedule", response_model=TimerNotifyResponse)
async def cancel_timer_notification(
    workout_id: str | None = None,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> TimerNotifyResponse:
    from arq import create_pool
    from arq.connections import RedisSettings
    from arq.jobs import Job

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    lock_key = ""
    lock_token = ""
    try:
        ref_key = _timer_job_ref(user.id, workout_id)
        lock_key, lock_token = await _acquire_timer_lock(redis, ref_key)
        current = await redis.get(ref_key)
        if current:
            await _request_timer_abort(
                Job(current.decode() if isinstance(current, bytes) else str(current), redis)
            )
            await redis.delete(ref_key)
    finally:
        if lock_key:
            await _release_timer_lock(redis, lock_key, lock_token)
        await redis.close()
    return TimerNotifyResponse(ok=True, detail="Отменено")

