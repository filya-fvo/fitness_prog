"""Admin: list / reset / delete users."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import Settings
from app.models.ai_conversation import AIConversation
from app.models.body_measurement import BodyMeasurement
from app.models.daily_metric import DailyMetric
from app.models.email_otp import EmailOtpCode
from app.models.nutrition import NutritionLog
from app.models.user import User
from app.models.workout import Workout, WorkoutSet
from app.schemas.admin import AdminResetScope, AdminUserRow
from app.services.telegram_bot import TelegramBotError, send_app_notification


def _anthro_name(user: User) -> tuple[str | None, str | None]:
    a = user.anthropometry if isinstance(user.anthropometry, dict) else {}
    first = (a.get("first_name") or a.get("tg_first_name") or "").strip() or None
    last = (a.get("last_name") or a.get("tg_last_name") or "").strip() or None
    return first, last


def display_name(user: User) -> str:
    first, last = _anthro_name(user)
    parts = [p for p in (last, first) if p]
    if parts:
        return " ".join(parts)
    if user.username:
        return f"@{user.username.lstrip('@')}"
    if user.auth_email:
        return str(user.auth_email)
    if user.telegram_id is not None:
        return f"tg:{user.telegram_id}"
    return str(user.id)[:8]


def to_admin_row(
    user: User,
    *,
    workouts_count: int = 0,
    completed_workouts: int = 0,
) -> AdminUserRow:
    first, last = _anthro_name(user)
    goals = user.goals if isinstance(user.goals, dict) else {}
    water = goals.get("water_log") if isinstance(goals.get("water_log"), dict) else {}
    return AdminUserRow(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=first,
        last_name=last,
        display_name=display_name(user),
        auth_email=getattr(user, "auth_email", None),
        subscription_status=user.subscription_status or "free",
        onboarding_completed=bool(goals.get("onboarding_completed")),
        created_at=getattr(user, "created_at", None),
        updated_at=getattr(user, "updated_at", None),
        workouts_count=workouts_count,
        completed_workouts=completed_workouts,
        has_water_log=bool(water),
        primary_goal=str(goals.get("primary_goal") or "") or None,
        level=str(goals.get("level") or "") or None,
    )


async def list_users(
    session: AsyncSession,
    *,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[AdminUserRow], int]:
    limit = max(1, min(500, limit))
    offset = max(0, offset)

    base = select(User).where(User.is_deleted.is_(False))
    count_q = select(func.count()).select_from(User).where(User.is_deleted.is_(False))

    needle = (q or "").strip().lstrip("@").lower()

    total = int((await session.execute(count_q)).scalar() or 0)
    result = await session.execute(
        base.order_by(User.created_at.desc().nullslast()).limit(500 if needle else limit).offset(
            0 if needle else offset
        )
    )
    users = list(result.scalars().all())

    ids = [u.id for u in users]
    counts: dict[uuid.UUID, tuple[int, int]] = {i: (0, 0) for i in ids}
    if ids:
        rows = await session.execute(
            select(
                Workout.user_id,
                func.count(Workout.id),
                func.count(Workout.id).filter(Workout.status == "completed"),
            )
            .where(Workout.user_id.in_(ids), Workout.is_deleted.is_(False))
            .group_by(Workout.user_id)
        )
        for uid, total_w, done_w in rows.all():
            counts[uid] = (int(total_w or 0), int(done_w or 0))

    rows_out: list[AdminUserRow] = []
    for u in users:
        tw, cw = counts.get(u.id, (0, 0))
        row = to_admin_row(u, workouts_count=tw, completed_workouts=cw)
        if needle:
            blob = " ".join(
                [
                    row.display_name,
                    row.username or "",
                    row.auth_email or "",
                    str(row.telegram_id or ""),
                    row.first_name or "",
                    row.last_name or "",
                ]
            ).lower()
            if needle not in blob:
                continue
        rows_out.append(row)

    if needle:
        total = len(rows_out)
        rows_out = rows_out[offset : offset + limit]

    return rows_out, total


async def get_user_or_404(session: AsyncSession, user_id: uuid.UUID) -> User:
    result = await session.execute(
        select(User).where(User.id == user_id, User.is_deleted.is_(False))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user


async def _delete_user_owned_rows(session: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    """Hard-delete user-owned rows (keep catalog tables)."""
    stats: dict[str, int] = {}

    w_ids = list(
        (await session.execute(select(Workout.id).where(Workout.user_id == user_id))).scalars().all()
    )
    if w_ids:
        dr = await session.execute(delete(WorkoutSet).where(WorkoutSet.workout_id.in_(w_ids)))
        stats["workout_sets"] = int(dr.rowcount or 0)
    else:
        stats["workout_sets"] = 0

    dr = await session.execute(delete(Workout).where(Workout.user_id == user_id))
    stats["workouts"] = int(dr.rowcount or 0)

    dr = await session.execute(delete(NutritionLog).where(NutritionLog.user_id == user_id))
    stats["nutrition_logs"] = int(dr.rowcount or 0)

    dr = await session.execute(delete(DailyMetric).where(DailyMetric.user_id == user_id))
    stats["daily_metrics"] = int(dr.rowcount or 0)

    dr = await session.execute(delete(BodyMeasurement).where(BodyMeasurement.user_id == user_id))
    stats["body_measurements"] = int(dr.rowcount or 0)

    dr = await session.execute(delete(AIConversation).where(AIConversation.user_id == user_id))
    stats["ai_conversations"] = int(dr.rowcount or 0)

    dr = await session.execute(delete(EmailOtpCode).where(EmailOtpCode.user_id == user_id))
    stats["email_otp_codes"] = int(dr.rowcount or 0)

    return stats


async def _delete_workout_rows(session: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    stats: dict[str, int] = {}
    workout_ids = list(
        (await session.execute(select(Workout.id).where(Workout.user_id == user_id))).scalars().all()
    )
    if workout_ids:
        result = await session.execute(
            delete(WorkoutSet).where(WorkoutSet.workout_id.in_(workout_ids))
        )
        stats["workout_sets"] = int(result.rowcount or 0)
    else:
        stats["workout_sets"] = 0
    result = await session.execute(delete(Workout).where(Workout.user_id == user_id))
    stats["workouts"] = int(result.rowcount or 0)
    return stats


async def _delete_nutrition_rows(session: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    result = await session.execute(delete(NutritionLog).where(NutritionLog.user_id == user_id))
    return {"nutrition_logs": int(result.rowcount or 0)}


def _clear_measurements(user: User) -> dict[str, int]:
    anthropometry = dict(user.anthropometry or {})
    measurements = anthropometry.pop("measurements", None)
    anthropometry.pop("measurements_updated_at", None)
    user.anthropometry = anthropometry
    flag_modified(user, "anthropometry")

    goals = dict(user.goals or {})
    state = dict(goals.get("notification_state") or {})
    state.pop("last_measurement_date", None)
    state.pop("last_measurement_mark", None)
    if state:
        goals["notification_state"] = state
    else:
        goals.pop("notification_state", None)
    user.goals = goals
    flag_modified(user, "goals")
    return {"measurements": len(measurements) if isinstance(measurements, dict) else 0}


async def _clear_daily_weights(session: AsyncSession, user_id: uuid.UUID) -> int:
    rows = list(
        (
            await session.scalars(
                select(DailyMetric).where(
                    DailyMetric.user_id == user_id,
                    DailyMetric.weight_kg.is_not(None),
                )
            )
        ).all()
    )
    for row in rows:
        row.weight_kg = None
        sources = dict(row.sources or {})
        sources.pop("weight_kg", None)
        row.sources = sources
    return len(rows)


async def clear_user_data(
    session: AsyncSession,
    user: User,
    *,
    scope: AdminResetScope,
    settings: Settings,
    notify: bool = True,
) -> dict[str, Any]:
    """Clear one data domain without resetting the rest of the profile."""
    if scope == "all":
        return await reset_user_profile(session, user, settings=settings, notify=notify)

    if scope == "workouts":
        stats = await _delete_workout_rows(session, user.id)
        title = "История тренировок очищена"
        text = "Администратор очистил тренировки и подходы. Анкета и выбранная программа сохранены."
    elif scope == "nutrition":
        stats = await _delete_nutrition_rows(session, user.id)
        goals = dict(user.goals or {})
        water = goals.pop("water_log", None)
        stats["water_days"] = len(water) if isinstance(water, dict) else 0
        user.goals = goals
        flag_modified(user, "goals")
        title = "Дневник питания очищен"
        text = "Администратор очистил дневник питания и воду. Профиль и цели сохранены."
    else:
        stats = _clear_measurements(user)
        stats["weight_days"] = await _clear_daily_weights(session, user.id)
        result = await session.execute(
            delete(BodyMeasurement).where(BodyMeasurement.user_id == user.id)
        )
        stats["body_measurements"] = int(result.rowcount or 0)
        title = "Замеры очищены"
        text = "Администратор очистил замеры тела. Анкета, рост, вес и остальные настройки сохранены."

    goals = dict(user.goals or {})
    goals["data_reset_at"] = datetime.now(timezone.utc).isoformat()
    goals["data_reset_scope"] = scope
    user.goals = goals
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)

    notified = False
    if notify and user.telegram_id is not None:
        try:
            await send_app_notification(
                settings,
                telegram_id=int(user.telegram_id),
                title=title,
                text=text,
                startapp="home",
            )
            notified = True
        except TelegramBotError as exc:
            logger.warning(
                "admin_scoped_reset_notify_failed user={} scope={} err={}",
                user.id,
                scope,
                exc,
            )

    return {"stats": stats, "notified": notified, "scope": scope}


def _preserve_identity_anthropometry(user: User) -> dict[str, Any]:
    """Keep Telegram name fields after profile wipe."""
    a = user.anthropometry if isinstance(user.anthropometry, dict) else {}
    keep: dict[str, Any] = {}
    for key in ("first_name", "last_name", "tg_first_name", "tg_last_name", "language_code"):
        if a.get(key) is not None and a.get(key) != "":
            keep[key] = a[key]
    return keep


async def reset_user_profile(
    session: AsyncSession,
    user: User,
    *,
    settings: Settings,
    notify: bool = True,
) -> dict[str, Any]:
    """
    Clear personal data so user must re-do onboarding.
    Keeps telegram_id / username / auth_email / TG name.
    """
    stats = await _delete_user_owned_rows(session, user.id)
    identity = _preserve_identity_anthropometry(user)
    user.anthropometry = identity
    flag_modified(user, "anthropometry")

    user.goals = {
        "onboarding_completed": False,
        "profile_reset_at": datetime.now(timezone.utc).isoformat(),
        "profile_reset_reason": "admin_reset",
    }
    flag_modified(user, "goals")

    await session.commit()
    await session.refresh(user)

    notified = False
    if notify and user.telegram_id is not None:
        try:
            await send_app_notification(
                settings,
                telegram_id=int(user.telegram_id),
                title="Профиль очищен",
                text=(
                    "Администратор сбросил ваш профиль в Fitness Mini App.\n\n"
                    "Откройте приложение и заново пройдите анкету "
                    "(цели, уровень, тело, программа).\n\n"
                    "История тренировок и дневник питания очищены."
                ),
                startapp="profile",
            )
            notified = True
        except TelegramBotError as exc:
            logger.warning("admin_reset_notify_failed user={} err={}", user.id, exc)

    return {"stats": stats, "notified": notified}


async def delete_user(
    session: AsyncSession,
    user: User,
    *,
    settings: Settings,
    notify: bool = True,
    actor_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Soft-delete user + wipe owned rows. Cannot delete self."""
    if actor_id is not None and user.id == actor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить свой аккаунт из админки",
        )

    stats = await _delete_user_owned_rows(session, user.id)
    tg_id = user.telegram_id
    uname = user.username

    user.is_deleted = True
    user.telegram_id = None  # type: ignore[assignment]
    if getattr(user, "auth_email", None):
        user.auth_email = None
    user.goals = {
        "onboarding_completed": False,
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "deleted_by_admin": True,
        "former_username": uname,
        "former_telegram_id": tg_id,
    }
    flag_modified(user, "goals")
    user.anthropometry = _preserve_identity_anthropometry(user)
    flag_modified(user, "anthropometry")

    await session.commit()

    notified = False
    if notify and tg_id is not None:
        try:
            await send_app_notification(
                settings,
                telegram_id=int(tg_id),
                title="Аккаунт удалён",
                text=(
                    "Ваш аккаунт в Fitness Mini App удалён администратором.\n\n"
                    "Если это ошибка — напишите в поддержку. "
                    "Можно заново открыть бота и пройти регистрацию."
                ),
                startapp="home",
            )
            notified = True
        except TelegramBotError as exc:
            logger.warning("admin_delete_notify_failed user={} err={}", user.id, exc)

    return {"stats": stats, "notified": notified, "former_telegram_id": tg_id}
