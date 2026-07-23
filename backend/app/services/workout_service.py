"""Workout instance business logic."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout, WorkoutSet
from app.schemas.workout import WorkoutCompleteRequest, WorkoutCreate, WorkoutPlan, WorkoutSetCreate


async def _get_workout_for_user(
    session: AsyncSession,
    *,
    workout_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Workout:
    result = await session.execute(
        select(Workout)
        .options(selectinload(Workout.sets))
        .where(
            Workout.id == workout_id,
            Workout.user_id == user_id,
            Workout.is_deleted.is_(False),
        )
    )
    workout = result.scalar_one_or_none()
    if workout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return workout


def _normalize_plan(plan: WorkoutPlan | dict[str, Any] | None) -> dict[str, Any]:
    if plan is None:
        return {"title": None, "workout_type": None, "exercises": []}
    if isinstance(plan, WorkoutPlan):
        return plan.model_dump(mode="json")
    return {
        "title": plan.get("title"),
        "workout_type": plan.get("workout_type"),
        "exercises": list(plan.get("exercises") or []),
    }


async def _load_exercises_map(
    session: AsyncSession,
    exercise_ids: list[uuid.UUID],
) -> dict[uuid.UUID, Exercise]:
    if not exercise_ids:
        return {}
    result = await session.scalars(
        select(Exercise).where(
            Exercise.id.in_(exercise_ids),
            Exercise.is_deleted.is_(False),
        )
    )
    items = list(result.all())
    found = {item.id: item for item in items}
    missing = [str(eid) for eid in exercise_ids if eid not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown exercise ids: {', '.join(missing)}",
        )
    return found


def _extract_day_from_program(program: Program, day_index: int) -> dict[str, Any]:
    structure = program.structure or {}
    schedule = structure.get("schedule") or structure.get("days") or []
    if not isinstance(schedule, list) or not schedule:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Program has no schedule days",
        )

    day: dict[str, Any] | None = None
    for item in schedule:
        if not isinstance(item, dict):
            continue
        idx = item.get("day_index", item.get("day"))
        if idx is None:
            continue
        try:
            if int(idx) == int(day_index):
                day = item
                break
        except (TypeError, ValueError):
            continue
    if day is None:
        if 1 <= day_index <= len(schedule) and isinstance(schedule[day_index - 1], dict):
            day = schedule[day_index - 1]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Program day_index={day_index} not found",
            )
    return day


async def build_plan_from_program_day(
    session: AsyncSession,
    program: Program,
    day_index: int,
) -> dict[str, Any]:
    structure = program.structure or {}
    day = _extract_day_from_program(program, day_index)
    raw_exercises = day.get("exercises") or []
    if not raw_exercises:
        raw_ids = day.get("exercise_ids") or []
        raw_exercises = [{"exercise_id": eid} for eid in raw_ids]

    if not raw_exercises:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Program day has no exercises",
        )

    names: list[str] = []
    ids: list[uuid.UUID] = []
    for item in raw_exercises:
        if not isinstance(item, dict):
            continue
        if item.get("exercise_id"):
            ids.append(uuid.UUID(str(item["exercise_id"])))
        elif item.get("exercise_name"):
            names.append(str(item["exercise_name"]))

    by_id = await _load_exercises_map(session, ids) if ids else {}
    by_name: dict[str, Exercise] = {}
    if names:
        result = await session.scalars(
            select(Exercise).where(
                Exercise.name_ru.in_(names),
                Exercise.is_deleted.is_(False),
            )
        )
        for ex in result.all():
            by_name[ex.name_ru] = ex

    plan_exercises: list[dict[str, Any]] = []
    order = 1
    for item in raw_exercises:
        if not isinstance(item, dict):
            continue
        exercise: Exercise | None = None
        if item.get("exercise_id"):
            exercise = by_id.get(uuid.UUID(str(item["exercise_id"])))
        elif item.get("exercise_name"):
            exercise = by_name.get(str(item["exercise_name"]))
        if exercise is None:
            continue
        target_sets = int(item.get("sets") or item.get("target_sets") or 3)
        target_reps = item.get("reps") or item.get("target_reps") or "8-12"
        rest_sec = int(item.get("rest_sec") or day.get("rest_sec_default") or 60)
        plan_exercises.append(
            {
                "exercise_id": str(exercise.id),
                "order": order,
                "target_sets": max(1, target_sets),
                "target_reps": str(target_reps),
                "rest_sec": max(0, rest_sec),
                "name_ru": exercise.name_ru,
            }
        )
        order += 1

    if not plan_exercises:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not resolve any exercises for program day",
        )

    title = day.get("name") or day.get("title") or program.name
    workout_type = (
        day.get("workout_type")
        or structure.get("workout_type")
        or program.workout_type
        or "custom"
    )
    return {
        "title": title,
        "workout_type": workout_type,
        "day_index": day_index,
        "exercises": plan_exercises,
    }


async def _plan_from_exercise_ids(
    session: AsyncSession,
    *,
    exercise_ids: list[uuid.UUID],
    sets_per_exercise: int,
    title: str | None,
    workout_type: str | None,
) -> dict[str, Any]:
    exercises = await _load_exercises_map(session, exercise_ids)
    plan_exercises: list[dict[str, Any]] = []
    for idx, eid in enumerate(exercise_ids, start=1):
        ex = exercises[eid]
        plan_exercises.append(
            {
                "exercise_id": str(ex.id),
                "order": idx,
                "target_sets": sets_per_exercise,
                "target_reps": "8-12",
                "rest_sec": 60,
                "name_ru": ex.name_ru,
            }
        )
    return {
        "title": title or "Своя тренировка",
        "workout_type": workout_type or "custom",
        "exercises": plan_exercises,
    }


def _create_set_slots(session: AsyncSession, workout_id: uuid.UUID, plan: dict[str, Any]) -> None:
    for item in plan.get("exercises") or []:
        exercise_id = uuid.UUID(str(item["exercise_id"]))
        target_sets = int(item.get("target_sets") or 3)
        for set_number in range(1, target_sets + 1):
            session.add(
                WorkoutSet(
                    workout_id=workout_id,
                    exercise_id=exercise_id,
                    set_number=set_number,
                    is_completed=False,
                    rest_time_sec=int(item.get("rest_sec") or 60),
                )
            )


async def create_workout(session: AsyncSession, user: User, data: WorkoutCreate) -> Workout:
    program: Program | None = None
    if data.program_id is not None:
        program = await session.scalar(
            select(Program).where(Program.id == data.program_id, Program.is_deleted.is_(False))
        )
        if program is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")

    if data.plan is not None and data.plan.exercises:
        ids = [item.exercise_id for item in data.plan.exercises]
        ex_map = await _load_exercises_map(session, ids)
        plan = _normalize_plan(data.plan)
        for item in plan["exercises"]:
            eid = uuid.UUID(str(item["exercise_id"]))
            item.setdefault("name_ru", ex_map[eid].name_ru)
    elif program is not None and (data.day_index is not None or not data.exercise_ids):
        day_index = data.day_index or 1
        plan = await build_plan_from_program_day(session, program, day_index)
    elif data.exercise_ids:
        plan = await _plan_from_exercise_ids(
            session,
            exercise_ids=data.exercise_ids,
            sets_per_exercise=data.sets_per_exercise,
            title=data.title,
            workout_type=data.workout_type,
        )
    else:
        plan = {
            "title": data.title or "Тренировка",
            "workout_type": data.workout_type or "custom",
            "exercises": [],
        }

    workout = Workout(
        user_id=user.id,
        program_id=data.program_id,
        scheduled_date=data.scheduled_date,
        status="planned",
        started_at=datetime.now(UTC),
        title=data.title or plan.get("title"),
        workout_type=data.workout_type or plan.get("workout_type"),
        plan=plan,
    )
    session.add(workout)
    await session.flush()
    _create_set_slots(session, workout.id, plan)
    await session.commit()
    return await _get_workout_for_user(session, workout_id=workout.id, user_id=user.id)


async def start_program_workout(
    session: AsyncSession,
    user: User,
    program_id: uuid.UUID,
    *,
    day_index: int = 1,
    scheduled_date: date | None = None,
) -> Workout:
    program = await session.scalar(
        select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
    )
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")

    payload = WorkoutCreate(
        scheduled_date=scheduled_date or date.today(),
        program_id=program_id,
        day_index=day_index,
    )
    return await create_workout(session, user, payload)


async def complete_workout(
    session: AsyncSession,
    user: User,
    workout_id: uuid.UUID,
    data: WorkoutCompleteRequest,
) -> Workout:
    workout = await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)
    if workout.status == "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workout already completed")

    now = datetime.now(UTC)
    workout.status = "completed"
    workout.rpe = data.rpe
    workout.ai_notes = data.ai_notes
    workout.completed_at = now
    if workout.started_at is None:
        workout.started_at = now
    if workout.started_at is not None:
        started = workout.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        workout.duration_sec = max(0, int((now - started).total_seconds()))

    await session.commit()
    return await _get_workout_for_user(session, workout_id=workout.id, user_id=user.id)


async def list_workout_history(
    session: AsyncSession,
    user: User,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[Workout], int]:
    filters = [Workout.user_id == user.id, Workout.is_deleted.is_(False)]
    if date_from is not None:
        filters.append(Workout.scheduled_date >= date_from)
    if date_to is not None:
        filters.append(Workout.scheduled_date <= date_to)

    total = await session.scalar(select(func.count()).select_from(Workout).where(*filters))
    result = await session.execute(
        select(Workout)
        .options(selectinload(Workout.sets))
        .where(*filters)
        .order_by(Workout.scheduled_date.desc(), Workout.created_at.desc())
    )
    return list(result.scalars().all()), int(total or 0)


async def add_workout_set(
    session: AsyncSession,
    user: User,
    workout_id: uuid.UUID,
    data: WorkoutSetCreate,
) -> WorkoutSet:
    workout = await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)
    if workout.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add sets to a completed workout",
        )

    exercise = await session.scalar(
        select(Exercise).where(Exercise.id == data.exercise_id, Exercise.is_deleted.is_(False))
    )
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")

    existing = await session.scalar(
        select(WorkoutSet).where(
            WorkoutSet.workout_id == workout.id,
            WorkoutSet.exercise_id == data.exercise_id,
            WorkoutSet.set_number == data.set_number,
            WorkoutSet.is_deleted.is_(False),
        )
    )
    if existing is not None:
        existing.reps = data.reps
        existing.weight = data.weight
        existing.rest_time_sec = data.rest_time_sec
        existing.is_completed = data.is_completed
        await session.commit()
        await session.refresh(existing)
        return existing

    workout_set = WorkoutSet(
        workout_id=workout.id,
        exercise_id=data.exercise_id,
        set_number=data.set_number,
        reps=data.reps,
        weight=data.weight,
        rest_time_sec=data.rest_time_sec,
        is_completed=data.is_completed,
    )
    session.add(workout_set)
    if workout.started_at is None:
        workout.started_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(workout_set)
    return workout_set


async def get_workout(session: AsyncSession, user: User, workout_id: uuid.UUID) -> Workout:
    return await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)
