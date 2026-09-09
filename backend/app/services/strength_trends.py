"""Bounded, explainable strength-trend sets for the PLUS dashboard."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from typing import Any

from fastapi import HTTPException
from loguru import logger
from sqlalchemy import Numeric, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.models.user_exercise_pin import UserExercisePin
from app.models.workout import Workout, WorkoutSet
from app.services import scheduler, workout_service
from app.services.workout_metrics import estimated_one_rep_max

PERIOD_DAYS = 56
NEXT_LIMIT = 6
BEST_LIMIT = 3
PIN_LIMIT = 8
MAX_HISTORY_POINTS = 4000
_ONE_DECIMAL = Decimal("0.1")


def _decimal(value: object) -> Decimal:
    return Decimal(str(value or 0))


def _rounded(value: Decimal) -> Decimal:
    return value.quantize(_ONE_DECIMAL, rounding=ROUND_HALF_UP)


def _change_percent(points: list[dict[str, object]]) -> Decimal | None:
    """Compare median 1RM in the first and second halves of at least three points."""

    if len(points) < 3:
        return None
    midpoint = max(1, len(points) // 2)
    early = [_decimal(point["estimated_1rm"]) for point in points[:midpoint]]
    recent = [_decimal(point["estimated_1rm"]) for point in points[midpoint:]]
    baseline = Decimal(str(median(early)))
    current = Decimal(str(median(recent)))
    latest = _decimal(points[-1]["estimated_1rm"])
    if baseline <= 0 or current <= baseline or latest < current:
        return None
    return _rounded((current - baseline) * Decimal(100) / baseline)


async def _history_by_exercise(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> dict[uuid.UUID, list[dict[str, object]]]:
    total_weight = case(
        (WorkoutSet.weight_mode == "per_hand", WorkoutSet.weight * 2),
        else_=WorkoutSet.weight,
    )
    score = total_weight * (1 + cast(WorkoutSet.reps, Numeric) / 30)
    ranked = (
        select(
            WorkoutSet.exercise_id.label("exercise_id"),
            Workout.scheduled_date.label("date"),
            WorkoutSet.weight.label("weight"),
            total_weight.label("total_weight"),
            WorkoutSet.reps.label("reps"),
            WorkoutSet.weight_mode.label("weight_mode"),
            func.row_number()
            .over(
                partition_by=(WorkoutSet.exercise_id, Workout.scheduled_date),
                order_by=(score.desc(), total_weight.desc(), WorkoutSet.reps.desc()),
            )
            .label("rank"),
        )
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            Workout.scheduled_date >= period_start,
            Workout.scheduled_date <= period_end,
            WorkoutSet.is_completed.is_(True),
            WorkoutSet.is_deleted.is_(False),
            WorkoutSet.weight > 0,
            WorkoutSet.reps > 0,
        )
        .cte("ranked_strength_trend_points")
    )
    rows = (
        await session.execute(
            select(ranked)
            .where(ranked.c.rank == 1)
            .order_by(ranked.c.date.desc(), ranked.c.exercise_id.asc())
            .limit(MAX_HISTORY_POINTS)
        )
    ).mappings().all()
    result: dict[uuid.UUID, list[dict[str, object]]] = {}
    for row in reversed(rows):
        exercise_id = row["exercise_id"]
        weight = _decimal(row["weight"])
        normalized = _decimal(row["total_weight"])
        reps = int(row["reps"])
        result.setdefault(exercise_id, []).append(
            {
                "date": row["date"],
                "weight": weight,
                "total_weight": normalized,
                "reps": reps,
                "estimated_1rm": estimated_one_rep_max(normalized, reps),
                "weight_mode": row["weight_mode"] if row["weight_mode"] in {"total", "per_hand"} else None,
            }
        )
    return result


async def _next_workout(
    session: AsyncSession,
    user: User,
    local_day: date,
) -> tuple[dict[str, object] | None, list[uuid.UUID]]:
    overview = await scheduler.get_schedule_overview(session, user, local_day)
    current = overview.get("current")
    occurrence = (
        current
        if isinstance(current, dict) and current.get("status") in {"scheduled", "missed"}
        else overview.get("next")
    )
    if not isinstance(occurrence, dict) or occurrence.get("program_id") is None:
        return None, []
    try:
        program_id = uuid.UUID(str(occurrence["program_id"]))
        day_index = int(occurrence.get("day_index") or 0)
        target_date = occurrence["target_date"]
        if day_index < 1 or not isinstance(target_date, date):
            return None, []
        program = await session.scalar(
            select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
        )
        if program is None:
            return None, []
        plan = await workout_service.build_program_plan_for_user(
            session,
            user,
            program,
            day_index=day_index,
            scheduled_date=target_date,
            week_phase=None,
            include_saved_override=True,
            apply_readiness_adjustment=False,
        )
        exercise_ids: list[uuid.UUID] = []
        for raw in plan.get("exercises") or []:
            try:
                exercise_id = uuid.UUID(str(raw.get("exercise_id")))
            except (AttributeError, TypeError, ValueError):
                continue
            if exercise_id not in exercise_ids:
                exercise_ids.append(exercise_id)
        return {
            "date": target_date,
            "title": str(plan.get("title") or occurrence.get("title") or "Тренировка"),
        }, exercise_ids[:NEXT_LIMIT]
    except (HTTPException, KeyError, TypeError, ValueError) as exc:
        logger.warning(
            "strength_trends_next_plan_unavailable user_id={} reason={}",
            user.id,
            type(exc).__name__,
        )
        return None, []


def _item(
    exercise: Exercise,
    points: list[dict[str, object]],
    *,
    pinned: bool,
) -> dict[str, object]:
    return {
        "exercise_id": exercise.id,
        "name": exercise.name_ru,
        "muscle_group": exercise.muscle_group,
        "is_pinned": pinned,
        "points": points,
        "latest": points[-1] if points else None,
        "previous": points[-2] if len(points) > 1 else None,
        "change_percent": _change_percent(points),
        "has_weight_mode_change": len(
            {str(point["weight_mode"]) for point in points if point.get("weight_mode")}
        ) > 1,
    }


async def get_strength_trend_sets(
    session: AsyncSession,
    *,
    user: User,
) -> dict[str, Any]:
    """Build three stable dashboard sets without returning complete workout history."""

    period_end = scheduler.local_schedule_day(user.goals or {})
    period_start = period_end - timedelta(days=PERIOD_DAYS - 1)
    history = await _history_by_exercise(
        session,
        user_id=user.id,
        period_start=period_start,
        period_end=period_end,
    )
    pinned_ids = list(
        (
            await session.scalars(
                select(UserExercisePin.exercise_id)
                .where(UserExercisePin.user_id == user.id)
                .order_by(UserExercisePin.created_at.asc())
                .limit(PIN_LIMIT)
            )
        ).all()
    )
    next_meta, next_ids = await _next_workout(session, user, period_end)
    candidate_ids = set(history) | set(pinned_ids) | set(next_ids)
    exercises = list(
        (
            await session.scalars(
                select(Exercise).where(
                    Exercise.id.in_(candidate_ids),
                    Exercise.is_deleted.is_(False),
                )
            )
        ).all()
    ) if candidate_ids else []
    by_id = {exercise.id: exercise for exercise in exercises}
    pinned_set = set(pinned_ids)

    best = [
        _item(exercise, history[exercise_id], pinned=exercise_id in pinned_set)
        for exercise_id, exercise in by_id.items()
        if exercise_id in history
        and len(history[exercise_id]) >= 3
        and (_change_percent(history[exercise_id]) or Decimal(0)) > 0
    ]
    best.sort(
        key=lambda item: (
            -_decimal(item["change_percent"]),
            -len(item["points"]),
            str(item["name"]),
        )
    )
    next_items = [
        _item(by_id[exercise_id], history[exercise_id], pinned=exercise_id in pinned_set)
        for exercise_id in next_ids
        if exercise_id in by_id and history.get(exercise_id)
    ]
    pinned_items = [
        _item(by_id[exercise_id], history.get(exercise_id, []), pinned=True)
        for exercise_id in pinned_ids
        if exercise_id in by_id
    ]
    if next_meta is not None:
        next_meta["items"] = next_items
    return {
        "period_start": period_start,
        "period_end": period_end,
        "period_days": PERIOD_DAYS,
        "next_workout": next_meta,
        "best_improvements": best[:BEST_LIMIT],
        "pinned": pinned_items,
    }
