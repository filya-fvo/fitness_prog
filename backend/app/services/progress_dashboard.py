"""Bounded workout aggregates for the personalized PLUS dashboard."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import Integer, Numeric, case, cast, column, func, select, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.user import User
from app.models.workout import Workout, WorkoutSet
from app.services import scheduler

ALLOWED_PERIOD_DAYS = {28, 56, 84}
_ONE_DECIMAL = Decimal("0.1")


def _decimal(value: object) -> Decimal:
    return Decimal(str(value or 0))


def _rounded(value: object) -> Decimal:
    return _decimal(value).quantize(_ONE_DECIMAL, rounding=ROUND_HALF_UP)


def _normalized_weight():
    return case(
        (WorkoutSet.weight_mode == "per_hand", WorkoutSet.weight * 2),
        else_=WorkoutSet.weight,
    )


def _daily_workout_statement(*, user_id: uuid.UUID, start: date, end: date):
    return (
        select(
            Workout.scheduled_date.label("date"),
            func.count(Workout.id).label("completed_workouts"),
            func.sum(cast(Workout.rpe, Numeric)).label("rpe_sum"),
            func.count(Workout.rpe).label("rpe_workouts"),
        )
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            Workout.scheduled_date >= start,
            Workout.scheduled_date <= end,
        )
        .group_by(Workout.scheduled_date)
        .order_by(Workout.scheduled_date.asc())
    )


def _daily_set_statement(*, user_id: uuid.UUID, start: date, end: date):
    volume = (
        cast(func.coalesce(WorkoutSet.reps, 0), Numeric)
        * func.coalesce(_normalized_weight(), 0)
    )
    return (
        select(
            Workout.scheduled_date.label("date"),
            func.count(WorkoutSet.id).label("completed_sets"),
            func.sum(volume).label("volume_kg"),
        )
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            Workout.scheduled_date >= start,
            Workout.scheduled_date <= end,
            WorkoutSet.is_completed.is_(True),
            WorkoutSet.is_deleted.is_(False),
        )
        .group_by(Workout.scheduled_date)
        .order_by(Workout.scheduled_date.asc())
    )


def _daily_planned_set_statement(*, user_id: uuid.UUID, start: date, end: date):
    exercises = func.jsonb_array_elements(Workout.plan["exercises"]).table_valued(
        column("value", JSONB)
    ).lateral()
    target_sets = cast(exercises.c.value["target_sets"].astext, Integer)
    return (
        select(
            Workout.scheduled_date.label("date"),
            func.sum(func.coalesce(target_sets, 0)).label("planned_sets"),
        )
        .select_from(Workout)
        .join(exercises, true())
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            Workout.scheduled_date >= start,
            Workout.scheduled_date <= end,
        )
        .group_by(Workout.scheduled_date)
        .order_by(Workout.scheduled_date.asc())
    )


def _muscle_group_statement(*, user_id: uuid.UUID, start: date, end: date):
    volume = (
        cast(func.coalesce(WorkoutSet.reps, 0), Numeric)
        * func.coalesce(_normalized_weight(), 0)
    )
    return (
        select(
            Exercise.muscle_group.label("muscle_group"),
            func.count(WorkoutSet.id).label("completed_sets"),
            func.count(func.distinct(WorkoutSet.exercise_id)).label("exercises"),
            func.sum(volume).label("volume_kg"),
        )
        .join(WorkoutSet, WorkoutSet.exercise_id == Exercise.id)
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            Workout.scheduled_date >= start,
            Workout.scheduled_date <= end,
            WorkoutSet.is_completed.is_(True),
            WorkoutSet.is_deleted.is_(False),
            Exercise.is_deleted.is_(False),
        )
        .group_by(Exercise.muscle_group)
        .order_by(func.count(WorkoutSet.id).desc(), Exercise.muscle_group.asc())
        .limit(20)
    )


def _summary(
    workout_rows: list[dict[str, object]],
    set_rows: list[dict[str, object]],
    planned_set_rows: list[dict[str, object]],
    *,
    start: date,
    end: date,
) -> dict[str, object]:
    workout_slice = [row for row in workout_rows if start <= row["date"] <= end]
    set_slice = [row for row in set_rows if start <= row["date"] <= end]
    planned_slice = [row for row in planned_set_rows if start <= row["date"] <= end]
    completed = sum(int(row["completed_workouts"] or 0) for row in workout_slice)
    rpe_count = sum(int(row["rpe_workouts"] or 0) for row in workout_slice)
    rpe_sum = sum((_decimal(row["rpe_sum"]) for row in workout_slice), Decimal(0))
    return {
        "completed_workouts": completed,
        "active_days": len([row for row in workout_slice if row["completed_workouts"]]),
        "completed_sets": sum(int(row["completed_sets"] or 0) for row in set_slice),
        "planned_sets": sum(int(row["planned_sets"] or 0) for row in planned_slice),
        "volume_kg": _rounded(sum((_decimal(row["volume_kg"]) for row in set_slice), Decimal(0))),
        "average_rpe": _rounded(rpe_sum / rpe_count) if rpe_count else None,
        "rpe_workouts": rpe_count,
    }


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _weekly_rows(
    workout_rows: list[dict[str, object]],
    set_rows: list[dict[str, object]],
    planned_set_rows: list[dict[str, object]],
    *,
    start: date,
    end: date,
) -> list[dict[str, object]]:
    workout_by_date = {row["date"]: row for row in workout_rows if start <= row["date"] <= end}
    sets_by_date = {row["date"]: row for row in set_rows if start <= row["date"] <= end}
    planned_by_date = {row["date"]: row for row in planned_set_rows if start <= row["date"] <= end}
    weeks: list[dict[str, object]] = []
    cursor = _monday(start)
    while cursor <= end:
        week_end = cursor + timedelta(days=6)
        visible_start = max(start, cursor)
        visible_end = min(end, week_end)
        days = [visible_start + timedelta(days=offset) for offset in range((visible_end - visible_start).days + 1)]
        week_workouts = [workout_by_date[day] for day in days if day in workout_by_date]
        week_sets = [sets_by_date[day] for day in days if day in sets_by_date]
        week_planned = [planned_by_date[day] for day in days if day in planned_by_date]
        weeks.append({
            "week_start": cursor,
            "week_end": week_end,
            "completed_workouts": sum(int(row["completed_workouts"] or 0) for row in week_workouts),
            "completed_sets": sum(int(row["completed_sets"] or 0) for row in week_sets),
            "planned_sets": sum(int(row["planned_sets"] or 0) for row in week_planned),
            "volume_kg": _rounded(sum((_decimal(row["volume_kg"]) for row in week_sets), Decimal(0))),
        })
        cursor += timedelta(days=7)
    return weeks


async def get_progress_dashboard(
    session: AsyncSession,
    *,
    user: User,
    period_days: int = 28,
) -> dict[str, Any]:
    """Return exact aggregates while keeping response size independent of history size."""

    if period_days not in ALLOWED_PERIOD_DAYS:
        raise ValueError("unsupported dashboard period")
    period_end = scheduler.local_schedule_day(user.goals or {})
    period_start = period_end - timedelta(days=period_days - 1)
    previous_end = period_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=period_days - 1)

    workout_rows = list(
        (
            await session.execute(
                _daily_workout_statement(user_id=user.id, start=previous_start, end=period_end)
            )
        ).mappings().all()
    )
    set_rows = list(
        (
            await session.execute(
                _daily_set_statement(user_id=user.id, start=previous_start, end=period_end)
            )
        ).mappings().all()
    )
    planned_set_rows = list(
        (
            await session.execute(
                _daily_planned_set_statement(user_id=user.id, start=previous_start, end=period_end)
            )
        ).mappings().all()
    )
    muscle_rows = list(
        (
            await session.execute(
                _muscle_group_statement(user_id=user.id, start=period_start, end=period_end)
            )
        ).mappings().all()
    )
    lifetime_workouts = await session.scalar(
        select(func.count(Workout.id)).where(
            Workout.user_id == user.id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
    )
    lifetime_sets = await session.scalar(
        select(func.count(WorkoutSet.id))
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(
            Workout.user_id == user.id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            WorkoutSet.is_completed.is_(True),
            WorkoutSet.is_deleted.is_(False),
        )
    )
    return {
        "period_start": period_start,
        "period_end": period_end,
        "period_days": period_days,
        "previous_period_start": previous_start,
        "previous_period_end": previous_end,
        "current": _summary(workout_rows, set_rows, planned_set_rows, start=period_start, end=period_end),
        "previous": _summary(workout_rows, set_rows, planned_set_rows, start=previous_start, end=previous_end),
        "weeks": _weekly_rows(workout_rows, set_rows, planned_set_rows, start=period_start, end=period_end),
        "muscle_groups": [
            {
                "muscle_group": str(row["muscle_group"] or "Без группы"),
                "completed_sets": int(row["completed_sets"] or 0),
                "exercises": int(row["exercises"] or 0),
                "volume_kg": _rounded(row["volume_kg"]),
            }
            for row in muscle_rows
        ],
        "lifetime_completed_workouts": int(lifetime_workouts or 0),
        "lifetime_completed_sets": int(lifetime_sets or 0),
    }
