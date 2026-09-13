"""Assign the next active-program occurrence to an earlier free day."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan_override import WorkoutPlanOverride
from app.services import scheduler, workout_reschedule

MAX_ASSIGNMENT_AHEAD_DAYS = 14


def preview_workout_assignment(
    goals: dict[str, Any],
    *,
    source_original_date: date,
    source_target_date: date,
    target_date: date,
    local_day: date,
) -> dict[str, Any]:
    """Validate moving one known upcoming occurrence to an earlier date."""

    context = scheduler.effective_workout_context(goals, source_target_date)
    active_program_id = str(goals.get("active_program_id") or "").strip()
    override = context.get("override") if isinstance(context.get("override"), dict) else None
    override_program_id = str((override or {}).get("program_id") or "").strip()
    program_matches = bool(active_program_id) and (
        not override_program_id or override_program_id == active_program_id
    )
    source_matches = (
        context["is_workout_day"]
        and context["original_date"] == source_original_date
        and context["target_date"] == source_target_date
        and program_matches
    )
    within_window = source_target_date <= local_day + timedelta(days=MAX_ASSIGNMENT_AHEAD_DAYS)
    can_assign = (
        source_matches
        and within_window
        and local_day <= target_date < source_target_date
    )
    existing_for_source = next(
        (
            row
            for row in scheduler._schedule_assignments(goals)
            if row["source_original_date"] == source_original_date.isoformat()
            and date.fromisoformat(str(row["scheduled_date"])) >= local_day
        ),
        None,
    )
    warning: str | None = None
    if not active_program_id:
        warning = "Сначала выберите активную программу."
    elif not source_matches:
        warning = "Расписание изменилось. Обновите экран и выберите тренировку снова."
    elif not within_window:
        warning = "Назначить раньше можно ближайшую тренировку в пределах двух недель."
    elif target_date < local_day:
        warning = "Выбранный день уже прошёл."
    elif target_date >= source_target_date:
        warning = "Выберите свободный день раньше следующей тренировки."
    elif existing_for_source is not None:
        can_assign = False
        warning = "Эта тренировка уже назначена на другой день. Сначала отмените назначение."

    conflicting_original = (
        workout_reschedule._occupied_original_date(
            goals,
            target_date,
            excluding_original=source_original_date,
        )
        if can_assign
        else None
    )
    if conflicting_original is not None:
        can_assign = False
        warning = "На выбранную дату уже запланирована тренировка. Выберите свободный день."

    return {
        "source_original_date": source_original_date,
        "source_target_date": source_target_date,
        "target_date": target_date,
        "min_date": local_day,
        "max_date": source_target_date - timedelta(days=1),
        "title": scheduler._fallback_title(goals, override),
        "can_assign": can_assign,
        "conflict": "target_already_scheduled" if conflicting_original is not None else None,
        "warning": warning,
    }


async def assign_workout_occurrence(
    session: AsyncSession,
    user: User,
    *,
    source_original_date: date,
    source_target_date: date,
    target_date: date,
    target_time: time,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Add the current program day earlier without removing its recurring source slot."""

    locked_user = await session.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    goals = dict(locked_user.goals or {})
    local_now = (now or datetime.now(UTC)).astimezone(scheduler._schedule_timezone(goals))
    normalized_time = target_time.replace(second=0, microsecond=0)

    existing_assignment = next(
        (
            row
            for row in scheduler._schedule_assignments(goals)
            if row["scheduled_date"] == target_date.isoformat()
            and row["source_original_date"] == source_original_date.isoformat()
            and row["source_target_date"] == source_target_date.isoformat()
            and row["target_time"] == normalized_time.strftime("%H:%M")
        ),
        None,
    )
    if existing_assignment is not None:
        return await scheduler.get_schedule_overview(session, locked_user, local_now.date())

    preview = preview_workout_assignment(
        goals,
        source_original_date=source_original_date,
        source_target_date=source_target_date,
        target_date=target_date,
        local_day=local_now.date(),
    )
    if not preview["can_assign"]:
        code = status.HTTP_409_CONFLICT if preview["conflict"] else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=preview["warning"] or "Не удалось назначить тренировку")

    target_at = datetime.combine(
        target_date,
        normalized_time,
        tzinfo=scheduler._schedule_timezone(goals),
    )
    if target_at <= local_now:
        raise HTTPException(status_code=400, detail="Выберите время, которое ещё не прошло")

    completed = await session.scalar(
        select(Workout.id).where(
            Workout.user_id == locked_user.id,
            Workout.scheduled_date.in_({source_target_date, target_date}),
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
    )
    if completed is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="На выбранной или исходной дате уже есть выполненная тренировка",
        )

    planned_on_target = await session.scalar(
        select(Workout.id).where(
            Workout.user_id == locked_user.id,
            Workout.scheduled_date == target_date,
            Workout.status == "planned",
            Workout.is_deleted.is_(False),
        )
    )
    if planned_on_target is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="На выбранную дату уже начата другая тренировка",
        )

    context = scheduler.effective_workout_context(goals, source_target_date)
    context_override = context.get("override") if isinstance(context.get("override"), dict) else {}
    program_id, day_index, title = await scheduler.active_program_snapshot(session, locked_user)
    assignments = [
        row
        for row in scheduler._schedule_assignments(goals)
        if row["scheduled_date"] != target_date.isoformat()
    ]
    assignments.append(
        {
            "scheduled_date": target_date.isoformat(),
            "source_original_date": source_original_date.isoformat(),
            "source_target_date": source_target_date.isoformat(),
            "target_time": normalized_time.strftime("%H:%M"),
            "program_id": str(context_override.get("program_id") or program_id or "") or None,
            "day_index": context_override.get("day_index") or day_index,
            "title": str(context_override.get("title") or title),
            "updated_at": datetime.now(UTC).isoformat(),
            "assignment": True,
        }
    )
    cutoff = local_now.date() - timedelta(days=scheduler.SCHEDULE_HISTORY_RETENTION_DAYS)
    goals[scheduler.ASSIGNMENTS_KEY] = [
        row for row in assignments if date.fromisoformat(str(row["scheduled_date"])) >= cutoff
    ]
    locked_user.goals = goals
    flag_modified(locked_user, "goals")

    await workout_reschedule._move_pending_occurrence(
        session,
        locked_user.id,
        source_target_date,
        target_date,
    )
    await session.commit()
    await session.refresh(locked_user)
    user.goals = locked_user.goals

    from app.services import supplement_intakes

    await supplement_intakes.reset_pending_days(
        session,
        locked_user,
        {source_target_date, target_date},
    )
    return await scheduler.get_schedule_overview(session, locked_user, local_now.date())


async def cancel_assigned_occurrence(
    session: AsyncSession,
    user: User,
    *,
    scheduled_date: date,
    source_target_date: date,
    local_day: date,
) -> dict[str, Any]:
    """Remove an assignment and return prepared state to its recurring date."""

    goals = dict(user.goals or {})
    goals[scheduler.ASSIGNMENTS_KEY] = [
        row
        for row in scheduler._schedule_assignments(goals)
        if row["scheduled_date"] != scheduled_date.isoformat()
    ]
    user.goals = goals
    flag_modified(user, "goals")
    await session.execute(
        update(Workout)
        .where(
            Workout.user_id == user.id,
            Workout.scheduled_date == scheduled_date,
            Workout.status == "planned",
            Workout.is_deleted.is_(False),
        )
        .values(scheduled_date=source_target_date)
    )
    await session.execute(
        update(WorkoutPlanOverride)
        .where(
            WorkoutPlanOverride.user_id == user.id,
            WorkoutPlanOverride.scheduled_date == scheduled_date,
            WorkoutPlanOverride.is_deleted.is_(False),
        )
        .values(scheduled_date=source_target_date)
    )
    await session.commit()
    await session.refresh(user)

    from app.services import supplement_intakes

    await supplement_intakes.reset_pending_days(
        session,
        user,
        {scheduled_date, source_target_date},
    )
    return await scheduler.get_schedule_overview(session, user, local_day)
