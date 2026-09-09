"""Bounded exercise progress aggregates and cursor-based diary pages."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import Numeric, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workout import Workout, WorkoutSet
from app.services.workout_metrics import estimated_one_rep_max

ExercisePhase = Literal["all", "light", "medium", "heavy"]
_VALID_PHASES = {"light", "medium", "heavy"}
_ONE_DECIMAL = Decimal("0.1")


def _phase_value(value: object) -> str:
    phase = str(value or "")
    return phase if phase in _VALID_PHASES else "unknown"


def _decimal(value: object) -> Decimal:
    return Decimal(str(value or 0))


def _rounded(value: Decimal) -> Decimal:
    return value.quantize(_ONE_DECIMAL, rounding=ROUND_HALF_UP)


def encode_diary_cursor(day: date, workout_id: uuid.UUID) -> str:
    payload = json.dumps(
        {"date": day.isoformat(), "id": str(workout_id)},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_diary_cursor(value: str) -> tuple[date, uuid.UUID]:
    try:
        padding = "=" * (-len(value) % 4)
        raw = base64.urlsafe_b64decode((value + padding).encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
        return date.fromisoformat(payload["date"]), uuid.UUID(payload["id"])
    except (binascii.Error, KeyError, TypeError, ValueError, UnicodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный курсор истории упражнения",
        ) from exc


def _metric_summary(points: list[dict[str, object]], field: str) -> dict[str, Decimal | None]:
    if not points:
        return {"latest": None, "best": None, "change": None}
    values = [_decimal(point[field]) for point in points]
    return {
        "latest": values[-1],
        "best": max(values),
        "change": _rounded(values[-1] - values[0]),
    }


def _common_filters(
    *,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    date_from: date,
    date_to: date,
) -> list[object]:
    return [
        Workout.user_id == user_id,
        Workout.status == "completed",
        Workout.is_deleted.is_(False),
        Workout.scheduled_date >= date_from,
        Workout.scheduled_date <= date_to,
        WorkoutSet.exercise_id == exercise_id,
        WorkoutSet.is_completed.is_(True),
        WorkoutSet.is_deleted.is_(False),
        WorkoutSet.weight > 0,
        WorkoutSet.reps > 0,
    ]


async def get_exercise_progress(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    date_from: date,
    date_to: date,
    phase: ExercisePhase = "all",
    diary_limit: int = 1,
    diary_cursor: str | None = None,
) -> dict[str, object]:
    """Return at most one strongest weighted point per day and a bounded diary page."""

    decoded_cursor = decode_diary_cursor(diary_cursor) if diary_cursor else None
    phase_expr = Workout.plan["week_phase"].astext
    total_weight = case(
        (WorkoutSet.weight_mode == "per_hand", WorkoutSet.weight * 2),
        else_=WorkoutSet.weight,
    )
    score = total_weight * (
        1 + cast(WorkoutSet.reps, Numeric) / 30
    )
    filters = _common_filters(
        user_id=user_id,
        exercise_id=exercise_id,
        date_from=date_from,
        date_to=date_to,
    )
    if phase != "all":
        filters.append(phase_expr == phase)

    ranked = (
        select(
            Workout.scheduled_date.label("date"),
            WorkoutSet.weight.label("weight"),
            total_weight.label("total_weight"),
            WorkoutSet.reps.label("reps"),
            WorkoutSet.weight_mode.label("weight_mode"),
            phase_expr.label("phase"),
            func.row_number()
            .over(
                partition_by=Workout.scheduled_date,
                order_by=(
                    score.desc(),
                    total_weight.desc(),
                    WorkoutSet.reps.desc(),
                    WorkoutSet.set_number.asc(),
                ),
            )
            .label("rank"),
        )
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(*filters)
        .cte("ranked_exercise_progress")
    )
    point_rows = (
        await session.execute(
            select(ranked)
            .where(ranked.c.rank == 1)
            .order_by(ranked.c.date.asc())
            .limit(366)
        )
    ).mappings().all()
    points: list[dict[str, object]] = []
    for row in point_rows:
        weight = _decimal(row["weight"])
        normalized = _decimal(row["total_weight"])
        reps = int(row["reps"])
        points.append(
            {
                "date": row["date"],
                "weight": weight,
                "total_weight": normalized,
                "reps": reps,
                "estimated_1rm": estimated_one_rep_max(normalized, reps),
                "weight_mode": row["weight_mode"] if row["weight_mode"] in {"total", "per_hand"} else None,
                "phase": _phase_value(row["phase"]),
            }
        )

    session_filters = list(filters)
    if decoded_cursor:
        cursor_day, cursor_id = decoded_cursor
        session_filters.append(
            or_(
                Workout.scheduled_date < cursor_day,
                and_(Workout.scheduled_date == cursor_day, Workout.id < cursor_id),
            )
        )
    session_rows = (
        await session.execute(
            select(
                Workout.id.label("workout_id"),
                Workout.scheduled_date.label("date"),
                phase_expr.label("phase"),
            )
            .join(WorkoutSet, WorkoutSet.workout_id == Workout.id)
            .where(*session_filters)
            .distinct()
            .order_by(Workout.scheduled_date.desc(), Workout.id.desc())
            .limit(diary_limit + 1)
        )
    ).mappings().all()
    visible_sessions = session_rows[:diary_limit]
    workout_ids = [row["workout_id"] for row in visible_sessions]
    set_rows: list[object] = []
    if workout_ids:
        set_rows = list(
            (
                await session.execute(
                    select(
                        WorkoutSet.workout_id.label("workout_id"),
                        WorkoutSet.set_number.label("set_number"),
                        WorkoutSet.weight.label("weight"),
                        total_weight.label("total_weight"),
                        WorkoutSet.reps.label("reps"),
                        WorkoutSet.weight_mode.label("weight_mode"),
                    )
                    .where(
                        WorkoutSet.workout_id.in_(workout_ids),
                        WorkoutSet.exercise_id == exercise_id,
                        WorkoutSet.is_completed.is_(True),
                        WorkoutSet.is_deleted.is_(False),
                        WorkoutSet.weight > 0,
                        WorkoutSet.reps > 0,
                    )
                    .order_by(WorkoutSet.workout_id, WorkoutSet.set_number.asc())
                )
            ).mappings().all()
        )

    sets_by_workout: dict[uuid.UUID, list[dict[str, object]]] = {
        workout_id: [] for workout_id in workout_ids
    }
    for row in set_rows:
        workout_id = row["workout_id"]
        sets_by_workout.setdefault(workout_id, []).append(
            {
                "set_number": int(row["set_number"]),
                "weight": _decimal(row["weight"]),
                "total_weight": _decimal(row["total_weight"]),
                "reps": int(row["reps"]),
                "weight_mode": row["weight_mode"] if row["weight_mode"] in {"total", "per_hand"} else None,
            }
        )
    diary = [
        {
            "workout_id": row["workout_id"],
            "date": row["date"],
            "phase": _phase_value(row["phase"]),
            "sets": sets_by_workout.get(row["workout_id"], []),
        }
        for row in visible_sessions
    ]
    next_cursor = None
    if len(session_rows) > diary_limit and visible_sessions:
        last = visible_sessions[-1]
        next_cursor = encode_diary_cursor(last["date"], last["workout_id"])

    return {
        "exercise_id": exercise_id,
        "period_start": date_from,
        "period_end": date_to,
        "points": points,
        "summary": {
            "total_weight": _metric_summary(points, "total_weight"),
            "estimated_1rm": _metric_summary(points, "estimated_1rm"),
        },
        "diary": diary,
        "next_diary_cursor": next_cursor,
    }
