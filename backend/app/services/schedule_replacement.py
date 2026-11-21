"""Preview and atomic persistence for recurring workout-day replacements."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User
from app.models.workout import Workout
from app.services import scheduler
from app.services.workout_schedule_occurrence import (
    OCCURRENCE_CHANGED,
    matches_scope,
    move_pending_occurrence,
    occurrence_scope,
    workouts_in_slot,
)

SCHEDULE_CHANGE_REQUESTS_KEY = "workout_schedule_change_requests"
MAX_SCHEDULE_CHANGE_REQUESTS = 32


def preview_workout_schedule_replacement(
    goals: dict[str, Any],
    *,
    original_date: date,
    target_date: date,
    target_time: time,
    effective_scope: str,
    conflict_resolution: str | None = None,
    local_day: date,
) -> dict[str, Any]:
    """Describe a recurring-day replacement before it can be committed."""

    if effective_scope not in {"current_week", "next_week"}:
        raise HTTPException(status_code=400, detail="Неизвестный момент изменения расписания")
    if original_date.weekday() not in scheduler.workout_days_on(goals, original_date):
        raise HTTPException(status_code=400, detail="Исходная дата не входит в расписание тренировок")
    if original_date < local_day - timedelta(days=scheduler.MAX_RESCHEDULE_LOOKBACK_DAYS):
        raise HTTPException(status_code=400, detail="Эту тренировку уже нельзя изменить")

    original_week_start = original_date - timedelta(days=original_date.weekday())
    target_week_start = target_date - timedelta(days=target_date.weekday())
    if target_week_start != original_week_start:
        raise HTTPException(
            status_code=400,
            detail="Выберите новый день в той же неделе, что и тренировка",
        )
    if effective_scope == "current_week" and target_date < local_day:
        raise HTTPException(status_code=400, detail="Новый день на этой неделе уже прошёл")

    current_days = scheduler.workout_days_on(goals, original_date)
    source_weekday = original_date.weekday()
    target_weekday = target_date.weekday()
    conflict = target_weekday != source_weekday and target_weekday in current_days
    new_days = set(current_days)
    if target_weekday != source_weekday:
        new_days.discard(source_weekday)
        new_days.add(target_weekday)

    effective_from = (
        original_week_start
        if effective_scope == "current_week"
        else original_week_start + timedelta(days=7)
    )
    moves_current = effective_scope == "current_week" and target_date != original_date and not conflict
    warning = None
    if conflict:
        warning = (
            "Этот день уже есть в расписании. Чтобы продолжить, подтвердите удаление "
            "исходного дня — тренировок в неделю станет меньше."
        )

    upcoming: list[date] = []
    candidate = local_day
    for _ in range(35):
        days_for_candidate = current_days if candidate < effective_from else new_days
        if candidate.weekday() in days_for_candidate:
            upcoming.append(candidate)
            if len(upcoming) == 3:
                break
        candidate += timedelta(days=1)

    settings = scheduler.workout_schedule_settings(goals)
    return {
        "schedule_revision": settings["revision"],
        "source_weekday": source_weekday,
        "target_weekday": target_weekday,
        "effective_from": effective_from,
        "previous_days": sorted(current_days),
        "new_days": sorted(new_days),
        "start_time": target_time.replace(second=0, microsecond=0),
        "upcoming_dates": upcoming,
        "moves_current_occurrence": moves_current,
        "conflict": "target_already_scheduled" if conflict else None,
        "requires_conflict_resolution": conflict and conflict_resolution != "reduce",
        "warning": warning,
    }


def _schedule_change_requests(goals: dict[str, Any]) -> list[dict[str, Any]]:
    raw = goals.get(SCHEDULE_CHANGE_REQUESTS_KEY)
    if not isinstance(raw, list):
        return []
    return [dict(item) for item in raw if isinstance(item, dict) and item.get("key")]


async def replace_recurring_workout_day(
    session: AsyncSession,
    user: User,
    *,
    original_date: date,
    target_date: date,
    target_time: time,
    effective_scope: str,
    conflict_resolution: str | None,
    expected_revision: int,
    idempotency_key: uuid.UUID,
    now: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any], bool]:
    """Atomically replace a recurring weekday while preserving past analytics."""

    locked_user = await session.scalar(
        select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)
    )
    if locked_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    goals = dict(locked_user.goals or {})
    local_day = scheduler.local_schedule_day(goals, now)
    request_key = str(idempotency_key)
    if any(row.get("key") == request_key for row in _schedule_change_requests(goals)):
        return (
            scheduler.workout_schedule_settings(goals),
            await scheduler.get_schedule_overview(session, locked_user, local_day),
            False,
        )

    current_revision = int(scheduler.workout_schedule_settings(goals)["revision"])
    if current_revision != expected_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Расписание уже изменилось. Обновите страницу и повторите.",
        )
    preview = preview_workout_schedule_replacement(
        goals,
        original_date=original_date,
        target_date=target_date,
        target_time=target_time,
        effective_scope=effective_scope,
        conflict_resolution=conflict_resolution,
        local_day=local_day,
    )
    if preview["requires_conflict_resolution"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Новый день уже есть в расписании. Подтвердите удаление исходного дня.",
        )

    normalized_time = target_time.replace(second=0, microsecond=0)
    settings = scheduler.workout_schedule_settings(goals)
    if preview["new_days"] == settings["days"] and normalized_time.strftime("%H:%M") == settings["start_time"]:
        raise HTTPException(status_code=400, detail="Расписание уже содержит выбранные день и время")

    original_override = scheduler._override_for_original(goals, original_date)
    source_date = date.fromisoformat(str(original_override["target_date"])) if original_override else original_date
    scope = occurrence_scope(goals, original_override)
    if preview["moves_current_occurrence"] and (
        scheduler._assignment_for_day(goals, source_date) is not None
        or scheduler._assignment_for_day(goals, target_date) is not None
    ):
        raise HTTPException(409, OCCURRENCE_CHANGED)
    completed = await session.scalar(select(Workout.id).where(*workouts_in_slot(
        locked_user.id, {original_date, source_date, target_date}, scope,
        workout_status="completed", include_unknown=True,
    )))
    if completed is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Выполненную тренировку изменить нельзя")

    tracking_start = scheduler.program_schedule_start(goals)
    created_at = getattr(locked_user, "created_at", None)
    if tracking_start is None:
        tracking_start = (
            scheduler.local_schedule_day(goals, created_at)
            if created_at is not None
            else local_day
        )
    goals = scheduler.apply_workout_schedule_settings(
        goals,
        days=set(preview["new_days"]),
        start_time=normalized_time,
        effective_from=preview["effective_from"],
        tracking_start=tracking_start,
    )

    affected_days = {original_date, source_date, target_date}
    if preview["moves_current_occurrence"]:
        await move_pending_occurrence(session, locked_user.id, source_date, target_date, scope)

    if effective_scope == "current_week":
        dates = {original_date.isoformat(), source_date.isoformat(), target_date.isoformat()}
        goals[scheduler.OVERRIDES_KEY] = [
            row for row in scheduler._schedule_overrides(goals)
            if not matches_scope(row, scope)
            or (row["original_date"] not in dates and row["target_date"] not in dates)
        ]
        goals[scheduler.CANCELLATIONS_KEY] = [
            row for row in scheduler._schedule_cancellations(goals)
            if not matches_scope(row, scope)
            or (row["scheduled_date"] not in dates and row.get("source_date") not in dates)
        ]
    requests = _schedule_change_requests(goals)
    requests.append(
        {
            "key": request_key,
            "revision": scheduler.workout_schedule_settings(goals)["revision"],
            "applied_at": datetime.now(UTC).isoformat(),
        }
    )
    goals[SCHEDULE_CHANGE_REQUESTS_KEY] = requests[-MAX_SCHEDULE_CHANGE_REQUESTS:]
    locked_user.goals = goals
    flag_modified(locked_user, "goals")

    from app.services import supplement_intakes

    await supplement_intakes.reset_pending_days(
        session,
        locked_user,
        affected_days,
        commit=False,
    )
    await session.commit()
    await session.refresh(locked_user)
    user.goals = locked_user.goals
    return (
        scheduler.workout_schedule_settings(goals),
        await scheduler.get_schedule_overview(session, locked_user, local_day),
        True,
    )
