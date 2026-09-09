"""Bounded last-working-set lookup for FREE workout preparation."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workout import Workout, WorkoutSet


async def load_hints_for_exercises(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    exercise_ids: list[uuid.UUID],
) -> list[dict[str, object]]:
    """Return one top completed set from the latest session per exercise."""

    unique_ids = list(dict.fromkeys(exercise_ids))
    if not unique_ids:
        return []

    completed_date = func.coalesce(cast(Workout.completed_at, Date), Workout.scheduled_date)
    raw_phase = Workout.plan["week_phase"].as_string()
    phase = case(
        (raw_phase.in_(["light", "medium", "heavy"]), raw_phase),
        else_="unknown",
    )
    ranked = (
        select(
            WorkoutSet.exercise_id.label("exercise_id"),
            WorkoutSet.weight.label("weight"),
            WorkoutSet.reps.label("reps"),
            WorkoutSet.duration_sec.label("duration_sec"),
            WorkoutSet.weight_mode.label("weight_mode"),
            WorkoutSet.machine_params.label("machine_params"),
            Workout.rpe.label("rpe"),
            completed_date.label("completed_date"),
            phase.label("phase"),
            func.row_number()
            .over(
                partition_by=(WorkoutSet.exercise_id, phase),
                order_by=(
                    completed_date.desc(),
                    Workout.completed_at.desc().nulls_last(),
                    Workout.created_at.desc(),
                    WorkoutSet.weight.desc().nulls_last(),
                    WorkoutSet.reps.desc().nulls_last(),
                    WorkoutSet.duration_sec.desc().nulls_last(),
                    WorkoutSet.set_number.asc(),
                ),
            )
            .label("rank"),
        )
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(
            Workout.user_id == user_id,
            Workout.is_deleted.is_(False),
            Workout.status == "completed",
            WorkoutSet.is_deleted.is_(False),
            WorkoutSet.is_completed.is_(True),
            WorkoutSet.exercise_id.in_(unique_ids),
            or_(
                WorkoutSet.weight > 0,
                WorkoutSet.reps > 0,
                WorkoutSet.duration_sec > 0,
                WorkoutSet.machine_params.is_not(None),
            ),
        )
        .cte("ranked_load_hints")
    )
    rows = (
        await session.execute(
            select(ranked)
            .where(ranked.c.rank == 1)
            .order_by(ranked.c.exercise_id, ranked.c.completed_date.desc())
        )
    ).mappings()
    grouped: dict[uuid.UUID, dict[str, object]] = {}
    for row in rows:
        exercise_id = row["exercise_id"]
        phase_name = str(row.get("phase") or "unknown")
        if phase_name not in {"light", "medium", "heavy"}:
            phase_name = "unknown"
        load = {
            "weight": _decimal_or_none(row["weight"]),
            "reps": row["reps"],
            "duration_sec": row["duration_sec"],
            "weight_mode": row["weight_mode"],
            "machine_params": row["machine_params"],
            "rpe": row["rpe"],
            "completed_date": _date_value(row["completed_date"]),
        }
        item = grouped.get(exercise_id)
        if item is None:
            item = {"exercise_id": exercise_id, **load, "phase_loads": {}}
            grouped[exercise_id] = item
        phase_loads = item["phase_loads"]
        assert isinstance(phase_loads, dict)
        phase_loads[phase_name] = load
    return list(grouped.values())


def _decimal_or_none(value: object) -> Decimal | None:
    return Decimal(str(value)) if value is not None else None


def _date_value(value: object) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))
