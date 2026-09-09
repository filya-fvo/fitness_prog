"""Preview and atomic persistence for one-off workout rescheduling."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan_override import WorkoutPlanOverride
from app.services import scheduler


def _week_bounds(day: date) -> tuple[date, date]:
    week_start = day - timedelta(days=day.weekday())
    return week_start, week_start + timedelta(days=6)


def _occupied_original_date(
    goals: dict[str, Any],
    day: date,
    *,
    excluding_original: date,
) -> date | None:
    """Return the occurrence occupying ``day`` after existing one-off changes."""

    day_key = day.isoformat()
    target_override = next(
        (
            row
            for row in scheduler._schedule_overrides(goals)
            if row["target_date"] == day_key
            and row["original_date"] != excluding_original.isoformat()
        ),
        None,
    )
    if target_override is not None:
        return date.fromisoformat(str(target_override["original_date"]))
    if scheduler._cancellation_for_day(goals, day) is not None:
        return None
    source_override = scheduler._override_for_original(goals, day)
    if source_override is not None and source_override.get("target_date") != day_key:
        return None
    if day != excluding_original and day.weekday() in scheduler.workout_days_on(goals, day):
        return day
    return None


def preview_workout_reschedule(
    goals: dict[str, Any],
    *,
    original_date: date,
    target_date: date,
    local_day: date,
) -> dict[str, Any]:
    """Describe a one-off move without mutating the recurring schedule."""

    week_start, week_end = _week_bounds(original_date)
    can_reschedule = (
        original_date.weekday() in scheduler.workout_days_on(goals, original_date)
        and target_date >= local_day
        and week_start <= target_date <= week_end
    )
    warning = None
    if target_date < local_day:
        warning = "Выбранный день уже прошёл."
    elif not week_start <= target_date <= week_end:
        warning = (
            "Разовый перенос доступен только в пределах этой недели. "
            "Можно отменить тренировку и выбрать нужный день и нагрузку перед следующим занятием."
        )

    conflict_date = (
        _occupied_original_date(goals, target_date, excluding_original=original_date)
        if can_reschedule
        else None
    )
    displaced_date = None
    if conflict_date is not None:
        candidate = target_date + timedelta(days=1)
        while candidate <= week_end:
            if (
                candidate >= local_day
                and _occupied_original_date(
                    goals,
                    candidate,
                    excluding_original=original_date,
                )
                is None
            ):
                displaced_date = candidate
                break
            candidate += timedelta(days=1)
        warning = (
            "На выбранную дату уже запланирована тренировка. "
            + (
                f"Её можно перенести на {displaced_date.strftime('%d.%m')} или отменить."
                if displaced_date is not None
                else "Свободного более позднего дня на этой неделе нет — её можно только отменить."
            )
        )

    return {
        "original_date": original_date,
        "target_date": target_date,
        "week_start": week_start,
        "week_end": week_end,
        "can_reschedule": can_reschedule,
        "conflict": "target_already_scheduled" if conflict_date is not None else None,
        "conflicting_original_date": conflict_date,
        "suggested_displaced_date": displaced_date,
        "warning": warning,
    }


async def reschedule_workout_occurrence(
    session: AsyncSession,
    user: User,
    *,
    original_date: date,
    target_date: date,
    target_time: time,
    conflict_resolution: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Move one occurrence inside its week, resolving an occupied target explicitly."""

    locked_user = await session.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    goals = dict(locked_user.goals or {})
    if original_date.weekday() not in scheduler.workout_days_on(goals, original_date):
        raise HTTPException(status_code=400, detail="Исходная дата не входит в расписание тренировок")
    local_now = (now or datetime.now(UTC)).astimezone(scheduler._schedule_timezone(goals))
    if original_date < local_now.date() - timedelta(days=scheduler.MAX_RESCHEDULE_LOOKBACK_DAYS):
        raise HTTPException(status_code=400, detail="Эту тренировку уже нельзя перенести")
    preview = preview_workout_reschedule(
        goals,
        original_date=original_date,
        target_date=target_date,
        local_day=local_now.date(),
    )
    if not preview["can_reschedule"]:
        raise HTTPException(
            status_code=400,
            detail=preview["warning"] or "Выберите дату в пределах этой недели",
        )

    normalized_time = target_time.replace(second=0, microsecond=0)
    base_time = scheduler.workout_start_time_on(goals, original_date)
    if target_date == original_date and normalized_time < base_time:
        raise HTTPException(
            status_code=400,
            detail="В этот день тренировку можно перенести только на более позднее время",
        )
    target_at = datetime.combine(
        target_date,
        normalized_time,
        tzinfo=scheduler._schedule_timezone(goals),
    )
    if target_at <= local_now:
        raise HTTPException(status_code=400, detail="Выберите время, которое ещё не прошло")

    conflict_date = preview["conflicting_original_date"]
    if conflict_date is not None and conflict_resolution not in {"move_existing", "cancel_existing"}:
        raise HTTPException(
            status_code=409,
            detail="На выбранную дату уже запланирована тренировка. Выберите, перенести её или отменить.",
        )
    if conflict_resolution == "move_existing" and preview["suggested_displaced_date"] is None:
        raise HTTPException(
            status_code=409,
            detail="На этой неделе нет свободного более позднего дня. Выберите другую дату или отмените занятую тренировку.",
        )

    completed_dates = {original_date}
    if conflict_date is not None:
        completed_dates.add(target_date)
    completed = await session.scalar(
        select(Workout.id).where(
            Workout.user_id == locked_user.id,
            Workout.scheduled_date.in_(completed_dates),
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
    )
    if completed is not None:
        raise HTTPException(status_code=409, detail="Выполненную тренировку перенести или отменить нельзя")

    overrides = scheduler._schedule_overrides(goals)
    cancellations = scheduler._schedule_cancellations(goals)
    affected_days = {original_date, target_date}
    if conflict_date is not None and conflict_resolution == "move_existing":
        displaced_date = preview["suggested_displaced_date"]
        assert isinstance(displaced_date, date)
        affected_days.add(displaced_date)
        displaced_time = scheduler.workout_start_time_on(goals, target_date)
        overrides = [
            row for row in overrides if row["original_date"] != conflict_date.isoformat()
        ]
        overrides.append(
            {
                "original_date": conflict_date.isoformat(),
                "target_date": displaced_date.isoformat(),
                "target_time": displaced_time.strftime("%H:%M"),
                "program_id": str(goals.get("active_program_id") or "") or None,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )
        await _move_pending_occurrence(session, locked_user.id, target_date, displaced_date)
    elif conflict_date is not None and conflict_resolution == "cancel_existing":
        overrides = [
            row for row in overrides if row["original_date"] != conflict_date.isoformat()
        ]
        cancellations = [
            row
            for row in cancellations
            if row["scheduled_date"] != target_date.isoformat()
            and row.get("source_date") != conflict_date.isoformat()
        ]
        cancellations.append(
            {
                "scheduled_date": target_date.isoformat(),
                "source_date": conflict_date.isoformat(),
                "program_id": str(goals.get("active_program_id") or "") or None,
                "title": "Тренировка отменена при переносе",
                "next_date": (
                    scheduler.next_base_workout_date(goals, target_date) or target_date
                ).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )
        await _cancel_pending_occurrence(session, locked_user.id, target_date)

    is_default_slot = target_date == original_date and normalized_time == base_time
    overrides = [row for row in overrides if row["original_date"] != original_date.isoformat()]
    if not is_default_slot:
        program_id, day_index, title = await scheduler.active_program_snapshot(session, locked_user)
        overrides.append(
            {
                "original_date": original_date.isoformat(),
                "target_date": target_date.isoformat(),
                "target_time": normalized_time.strftime("%H:%M"),
                "program_id": str(program_id) if program_id else None,
                "day_index": day_index,
                "title": title,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )
        await _move_pending_occurrence(session, locked_user.id, original_date, target_date)

    cutoff = local_now.date() - timedelta(days=scheduler.SCHEDULE_HISTORY_RETENTION_DAYS)
    goals[scheduler.OVERRIDES_KEY] = [
        row for row in overrides if date.fromisoformat(str(row["target_date"])) >= cutoff
    ]
    goals[scheduler.CANCELLATIONS_KEY] = [
        row
        for row in cancellations
        if date.fromisoformat(str(row["scheduled_date"])) >= cutoff
    ]
    locked_user.goals = goals
    flag_modified(locked_user, "goals")
    await session.commit()
    await session.refresh(locked_user)
    user.goals = locked_user.goals

    from app.services import supplement_intakes

    await supplement_intakes.reset_pending_days(
        session,
        locked_user,
        affected_days,
    )
    return await scheduler.get_schedule_overview(session, locked_user, local_now.date())


async def _move_pending_occurrence(
    session: AsyncSession,
    user_id: uuid.UUID,
    source_date: date,
    target_date: date,
) -> None:
    await session.execute(
        update(Workout)
        .where(
            Workout.user_id == user_id,
            Workout.scheduled_date == source_date,
            Workout.status == "planned",
            Workout.is_deleted.is_(False),
        )
        .values(scheduled_date=target_date)
    )
    await session.execute(
        update(WorkoutPlanOverride)
        .where(
            WorkoutPlanOverride.user_id == user_id,
            WorkoutPlanOverride.scheduled_date == source_date,
            WorkoutPlanOverride.is_deleted.is_(False),
        )
        .values(scheduled_date=target_date)
    )


async def _cancel_pending_occurrence(
    session: AsyncSession,
    user_id: uuid.UUID,
    target_date: date,
) -> None:
    await session.execute(
        update(Workout)
        .where(
            Workout.user_id == user_id,
            Workout.scheduled_date == target_date,
            Workout.status == "planned",
            Workout.is_deleted.is_(False),
        )
        .values(status="skipped")
    )
    await session.execute(
        update(WorkoutPlanOverride)
        .where(
            WorkoutPlanOverride.user_id == user_id,
            WorkoutPlanOverride.scheduled_date == target_date,
            WorkoutPlanOverride.is_deleted.is_(False),
        )
        .values(is_deleted=True)
    )
