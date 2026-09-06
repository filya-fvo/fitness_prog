"""Personal plan adherence without changing frozen competition baselines."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.workout import Workout
from app.services import scheduler


@dataclass(frozen=True, slots=True)
class PersonalRegularity:
    period_start: date
    period_end: date
    has_schedule: bool
    completed: int
    planned: int
    rescheduled_completed: int
    cancelled: int
    missed: int
    completion_pct: float | None


def calculate_personal_regularity(
    *,
    goals: dict,
    local_day: date,
    completed_dates: Iterable[date],
    days: int = 28,
    tracking_start: date | None = None,
) -> PersonalRegularity:
    period_start = local_day - timedelta(days=max(1, days) - 1)
    slot_start = max(period_start, tracking_start) if tracking_start else period_start
    completed_set = set(completed_dates)
    completed = 0
    planned = 0
    rescheduled_completed = 0
    cancelled = 0
    has_active_plan = bool(goals.get("active_program_id"))
    slots = (
        scheduler.workout_schedule_slots(goals, slot_start, local_day)
        if has_active_plan
        else []
    )
    has_schedule = bool(has_active_plan and (scheduler.workout_days(goals) or slots))
    for slot in slots:
        is_completed = slot.target_date in completed_set
        is_eligible = is_completed or slot.is_cancelled or slot.target_date < local_day
        if not is_eligible:
            continue
        planned += 1
        if is_completed:
            completed += 1
            if slot.is_rescheduled:
                rescheduled_completed += 1
        elif slot.is_cancelled:
            cancelled += 1

    missed = planned - completed - cancelled
    completion_pct = round(min(100, completed * 100 / planned), 1) if planned else None
    return PersonalRegularity(
        period_start=period_start,
        period_end=local_day,
        has_schedule=has_schedule,
        completed=completed,
        planned=planned,
        rescheduled_completed=rescheduled_completed,
        cancelled=cancelled,
        missed=missed,
        completion_pct=completion_pct,
    )


async def personal_regularity_for_user(
    session: AsyncSession,
    user: User,
    *,
    days: int = 28,
) -> PersonalRegularity:
    goals = dict(user.goals or {})
    local_day = scheduler.local_schedule_day(goals)
    period_start = local_day - timedelta(days=days - 1)
    program_start = scheduler.program_schedule_start(goals)
    created_at = getattr(user, "created_at", None)
    tracking_start = program_start or (
        scheduler.local_schedule_day(goals, created_at) if created_at is not None else period_start
    )
    active_program_id = goals.get("active_program_id")
    filters = [
        Workout.user_id == user.id,
        Workout.scheduled_date >= max(period_start, tracking_start),
        Workout.scheduled_date <= local_day,
        Workout.status == "completed",
        Workout.is_deleted.is_(False),
    ]
    if active_program_id:
        try:
            filters.append(Workout.program_id == uuid.UUID(str(active_program_id)))
        except ValueError:
            pass
    rows = await session.scalars(select(Workout.scheduled_date).distinct().where(*filters))
    return calculate_personal_regularity(
        goals=goals,
        local_day=local_day,
        completed_dates=rows.all(),
        days=days,
        tracking_start=tracking_start,
    )
