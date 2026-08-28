"""Workout instance business logic."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout, WorkoutSet
from app.schemas.workout import (
    WorkoutCompleteRequest,
    WorkoutCreate,
    WorkoutPlan,
    WorkoutSetCreate,
    WorkoutUpdateRequest,
)
from app.services import planned_workout, program_publication
from app.services.workout_notifications import mark_occurrence_started


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")
    return workout


def _normalize_plan(plan: WorkoutPlan | dict[str, Any] | None) -> dict[str, Any]:
    if plan is None:
        return {"title": None, "workout_type": None, "exercises": []}
    if isinstance(plan, WorkoutPlan):
        return plan.model_dump(mode="json")
    return {
        "title": plan.get("title"),
        "workout_type": plan.get("workout_type"),
        "day_index": plan.get("day_index"),
        "week_phase": plan.get("week_phase"),
        "week_in_cycle": plan.get("week_in_cycle"),
        "week_label": plan.get("week_label"),
        "week_rir": plan.get("week_rir"),
        "exercises": list(plan.get("exercises") or []),
    }


def resolve_week_phase_meta(started_at: date | None, today: date | None = None) -> dict[str, Any]:
    """3-week cycle: light -> medium -> heavy."""
    today = today or date.today()
    if started_at is None:
        started_at = today
    weeks = max(0, (today - started_at).days // 7)
    week_in_cycle = (weeks % 3) + 1
    if week_in_cycle == 1:
        phase, label, rir, reps = "light", "Лёгкая", "3–4 до отказа", "10-15"
    elif week_in_cycle == 2:
        phase, label, rir, reps = "medium", "Средняя", "1–2 до отказа", "8-12"
    else:
        phase, label, rir, reps = "heavy", "Тяжёлая", "в отказ", "6-8"
    return {
        "week_phase": phase,
        "week_in_cycle": week_in_cycle,
        "week_label": label,
        "week_rir": rir,
        "target_reps": reps,
        "cycle_index": weeks // 3,
    }



def phase_meta_from_name(
    phase: str,
    *,
    week_in_cycle: int | None = None,
    cycle_index: int = 0,
) -> dict[str, Any]:
    """Build phase meta from explicit light|medium|heavy."""
    key = (phase or "").strip().lower()
    table = {
        "light": (1, "Лёгкая", "3–4 до отказа", "10-15"),
        "medium": (2, "Средняя", "1–2 до отказа", "8-12"),
        "heavy": (3, "Тяжёлая", "в отказ", "6-8"),
    }
    if key not in table:
        key = "medium"
    wic, label, rir, reps = table[key]
    return {
        "week_phase": key,
        "week_in_cycle": int(week_in_cycle or wic),
        "week_label": label,
        "week_rir": rir,
        "target_reps": reps,
        "cycle_index": max(0, int(cycle_index)),
    }


def next_phase_after_split_cycle(phase: str) -> str:
    order = ["light", "medium", "heavy"]
    key = (phase or "medium").strip().lower()
    if key not in order:
        key = "medium"
    return order[(order.index(key) + 1) % len(order)]


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
            detail=f"Не найдены упражнения: {', '.join(missing)}",
        )
    return found


def _extract_day_from_program(program: Program, day_index: int) -> dict[str, Any]:
    structure = program.structure or {}
    schedule = structure.get("schedule") or structure.get("days") or []
    if not isinstance(schedule, list) or not schedule:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="В программе нет тренировочных дней",
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
                detail=f"День программы №{day_index} не найден",
            )
    return day


async def build_plan_from_program_day(
    session: AsyncSession,
    program: Program,
    day_index: int,
    *,
    program_started_at: date | None = None,
    today: date | None = None,
    week_phase: str | None = None,
) -> dict[str, Any]:
    structure = program.structure or {}
    day = _extract_day_from_program(program, day_index)
    if week_phase:
        auto = resolve_week_phase_meta(program_started_at, today)
        phase = phase_meta_from_name(
            week_phase,
            week_in_cycle=None,
            cycle_index=int(auto.get("cycle_index") or 0),
        )
    else:
        phase = resolve_week_phase_meta(program_started_at, today)
    raw_exercises = day.get("exercises") or []
    if not raw_exercises:
        raw_ids = day.get("exercise_ids") or []
        raw_exercises = [{"exercise_id": eid} for eid in raw_ids]

    if not raw_exercises:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="В этом дне программы нет упражнений",
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
        # Prefer phase-based reps (3-week cycle) over static seed reps
        target_reps = phase["target_reps"]
        rest_sec = int(item.get("rest_sec") or day.get("rest_sec_default") or 60)
        if phase["week_phase"] == "heavy":
            rest_sec = max(rest_sec, 90)
        elif phase["week_phase"] == "light":
            rest_sec = min(rest_sec, 75)
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
            detail="Не удалось найти упражнения для этого дня программы",
        )

    title = day.get("name") or day.get("title") or program.name
    phase_title = f"{title} · {phase['week_label']}"
    workout_type = (
        day.get("workout_type")
        or structure.get("workout_type")
        or program.workout_type
        or "custom"
    )
    return {
        "title": phase_title,
        "workout_type": workout_type,
        "day_index": day_index,
        "week_phase": phase["week_phase"],
        "week_in_cycle": phase["week_in_cycle"],
        "week_label": phase["week_label"],
        "week_rir": phase["week_rir"],
        "location": structure.get("location"),
        "equipment": list(structure.get("equipment") or []),
        "limitations": list(structure.get("limitations") or []),
        "exercises": plan_exercises,
    }


async def build_program_plan_for_user(
    session: AsyncSession,
    user: User,
    program: Program,
    *,
    day_index: int,
    scheduled_date: date,
    week_phase: str | None,
    include_saved_override: bool = True,
    consume_saved_override: bool = False,
) -> dict[str, Any]:
    started_raw = (user.goals or {}).get("active_program_started_at")
    started_at: date | None = None
    if isinstance(started_raw, str) and len(started_raw) >= 10:
        try:
            started_at = date.fromisoformat(started_raw[:10])
        except ValueError:
            started_at = None
    active_id = str((user.goals or {}).get("active_program_id") or "")
    if active_id and active_id != str(program.id):
        started_at = scheduled_date
    elif started_at is None:
        started_at = scheduled_date
    plan = await build_plan_from_program_day(
        session,
        program,
        day_index,
        program_started_at=started_at,
        today=scheduled_date,
        week_phase=week_phase,
    )
    if not include_saved_override:
        return plan
    return await planned_workout.apply_saved_override(
        session,
        user_id=user.id,
        program_id=program.id,
        scheduled_date=scheduled_date,
        day_index=day_index,
        base_plan=plan,
        consume=consume_saved_override,
    )


async def preview_program_plan(
    session: AsyncSession,
    user: User,
    *,
    program_id: uuid.UUID,
    day_index: int,
    scheduled_date: date,
    week_phase: str | None,
    include_saved_override: bool = True,
) -> dict[str, Any]:
    program = await session.scalar(
        select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
    )
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    if not program_publication.is_accessible_to_user(
        program, (user.goals or {}).get("active_program_id")
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    return await build_program_plan_for_user(
        session,
        user,
        program,
        day_index=day_index,
        scheduled_date=scheduled_date,
        week_phase=week_phase,
        include_saved_override=include_saved_override,
    )


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
    if data.client_workout_id is not None:
        existing = await session.scalar(
            select(Workout).where(
                Workout.user_id == user.id,
                Workout.client_workout_id == data.client_workout_id,
                Workout.is_deleted.is_(False),
            )
        )
        if existing is not None:
            return await _get_workout_for_user(
                session,
                workout_id=existing.id,
                user_id=user.id,
            )

    program: Program | None = None
    if data.program_id is not None:
        program = await session.scalar(
            select(Program).where(Program.id == data.program_id, Program.is_deleted.is_(False))
        )
        if program is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
        if not program_publication.is_accessible_to_user(
            program, (user.goals or {}).get("active_program_id")
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")

    if data.plan is not None and data.plan.exercises:
        ids = [item.exercise_id for item in data.plan.exercises]
        ex_map = await _load_exercises_map(session, ids)
        plan = _normalize_plan(data.plan)
        for item in plan["exercises"]:
            eid = uuid.UUID(str(item["exercise_id"]))
            item.setdefault("name_ru", ex_map[eid].name_ru)
    elif program is not None and (data.day_index is not None or not data.exercise_ids):
        day_index = data.day_index or 1
        plan = await build_program_plan_for_user(
            session,
            user,
            program,
            day_index=day_index,
            scheduled_date=data.scheduled_date,
            week_phase=data.week_phase,
            consume_saved_override=True,
        )
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
        client_workout_id=data.client_workout_id,
        program_id=data.program_id,
        scheduled_date=data.scheduled_date,
        status="planned",
        started_at=datetime.now(UTC),
        title=data.title or plan.get("title"),
        workout_type=data.workout_type or plan.get("workout_type"),
        plan=plan,
    )
    if data.program_id is not None:
        user.goals = mark_occurrence_started(user.goals or {}, data.scheduled_date)
        flag_modified(user, "goals")
    session.add(workout)
    await session.flush()
    _create_set_slots(session, workout.id, plan)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        if data.client_workout_id is None:
            raise
        existing = await session.scalar(
            select(Workout).where(
                Workout.user_id == user.id,
                Workout.client_workout_id == data.client_workout_id,
                Workout.is_deleted.is_(False),
            )
        )
        if existing is None:
            raise
        workout = existing
    return await _get_workout_for_user(session, workout_id=workout.id, user_id=user.id)


async def start_program_workout(
    session: AsyncSession,
    user: User,
    program_id: uuid.UUID,
    *,
    day_index: int = 1,
    scheduled_date: date | None = None,
    week_phase: str | None = None,
) -> Workout:
    program = await session.scalar(
        select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
    )
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    if not program_publication.is_accessible_to_user(
        program, (user.goals or {}).get("active_program_id")
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")

    target_date = scheduled_date or date.today()
    existing = await session.scalar(
        select(Workout)
        .where(
            Workout.user_id == user.id,
            Workout.program_id == program_id,
            Workout.scheduled_date == target_date,
            Workout.is_deleted.is_(False),
        )
        .order_by(Workout.created_at.desc())
    )
    if existing is not None:
        if existing.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Тренировка по этой программе на сегодня уже выполнена",
            )
        return await _get_workout_for_user(
            session,
            workout_id=existing.id,
            user_id=user.id,
        )

    payload = WorkoutCreate(
        scheduled_date=target_date,
        program_id=program_id,
        day_index=day_index,
        week_phase=week_phase,
    )
    return await create_workout(session, user, payload)


async def _advance_program_cursor_for_completed_workout(
    session: AsyncSession,
    user: User,
    workout: Workout,
) -> bool:
    """Advance the active program cursor once for its latest completed day.

    Completion is also retried by the offline queue. The cursor guard and the
    latest-completion check make this repair safe for repeated and delayed calls.
    """
    if workout.program_id is None:
        return False
    goals = dict(user.goals or {})
    if str(goals.get("active_program_id") or "") != str(workout.program_id):
        return False

    program = await session.scalar(
        select(Program).where(Program.id == workout.program_id, Program.is_deleted.is_(False))
    )
    if program is None:
        return False
    structure = program.structure if isinstance(program.structure, dict) else {}
    schedule = structure.get("schedule") or structure.get("days") or []
    if not isinstance(schedule, list) or not schedule:
        return False
    day_index = _program_day_index(workout, schedule)
    if day_index < 1:
        return False
    try:
        cursor_day = int(goals.get("active_program_next_day") or 0)
    except (TypeError, ValueError):
        cursor_day = 0
    if cursor_day != day_index:
        return False

    latest_completed_id = await session.scalar(
        select(Workout.id)
        .where(
            Workout.user_id == user.id,
            Workout.program_id == workout.program_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
        .order_by(
            Workout.scheduled_date.desc(),
            Workout.completed_at.desc().nullslast(),
            Workout.created_at.desc(),
        )
        .limit(1)
    )
    if latest_completed_id != workout.id:
        return False

    plan = workout.plan if isinstance(workout.plan, dict) else {}
    phase = str(plan.get("week_phase") or "").strip().lower()
    if phase not in {"light", "medium", "heavy"}:
        current_phase = str(goals.get("active_program_week_phase") or "").strip().lower()
        phase = current_phase if current_phase in {"light", "medium", "heavy"} else "medium"

    next_day = (day_index % len(schedule)) + 1
    if next_day == 1 and day_index == len(schedule):
        phase = next_phase_after_split_cycle(phase)
        goals["active_program_phase_source"] = "manual"
        goals["active_program_workouts_in_phase"] = 0
    else:
        goals["active_program_workouts_in_phase"] = day_index
    goals["active_program_next_day"] = next_day
    goals["active_program_week_phase"] = phase
    user.goals = goals
    flag_modified(user, "goals")
    return True


async def complete_workout(
    session: AsyncSession,
    user: User,
    workout_id: uuid.UUID,
    data: WorkoutCompleteRequest,
) -> Workout:
    workout = await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)
    if workout.status == "completed":
        # Also repairs cursors from older/client-only completion flows.
        repaired = await _advance_program_cursor_for_completed_workout(session, user, workout)
        if repaired:
            await session.commit()
            return await _get_workout_for_user(session, workout_id=workout.id, user_id=user.id)
        # Offline clients may retry after the server committed but the response was lost.
        return workout

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

    # AsyncSessionLocal has autoflush disabled. Persist the completed status in
    # this transaction before the latest-completion guard queries the database.
    await session.flush()
    await _advance_program_cursor_for_completed_workout(session, user, workout)
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
    exercise = await session.scalar(
        select(Exercise).where(Exercise.id == data.exercise_id, Exercise.is_deleted.is_(False))
    )
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение не найдено")

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
        existing.weight_mode = data.weight_mode
        existing.rest_time_sec = data.rest_time_sec
        existing.duration_sec = data.duration_sec
        existing.note = data.note
        existing.machine_params = data.machine_params
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
        weight_mode=data.weight_mode,
        rest_time_sec=data.rest_time_sec,
        duration_sec=data.duration_sec,
        note=data.note,
        machine_params=data.machine_params,
        is_completed=data.is_completed,
    )
    session.add(workout_set)
    if workout.started_at is None:
        workout.started_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(workout_set)
    return workout_set


async def update_workout(
    session: AsyncSession,
    user: User,
    workout_id: uuid.UUID,
    data: WorkoutUpdateRequest,
) -> Workout:
    """Update notes/RPE without changing completion timestamps or schedule."""
    workout = await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)
    workout.rpe = data.rpe
    workout.ai_notes = data.ai_notes
    await session.commit()
    return await _get_workout_for_user(session, workout_id=workout.id, user_id=user.id)


async def delete_workout(
    session: AsyncSession,
    user: User,
    workout_id: uuid.UUID,
) -> None:
    """Soft-delete a workout and its sets so it disappears from all progress metrics."""
    workout = await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)
    await _rollback_program_cursor_for_deleted_workout(session, user, workout)
    now = datetime.now(UTC)
    workout.is_deleted = True
    workout.updated_at = now
    for workout_set in workout.sets:
        workout_set.is_deleted = True
        workout_set.updated_at = now
    await session.commit()


def _program_day_index(workout: Workout, schedule: list[Any]) -> int:
    """Resolve a program day for current and legacy workout snapshots."""
    plan = workout.plan or {}
    try:
        day_index = int(plan.get("day_index") or 0)
    except (TypeError, ValueError):
        day_index = 0
    if 1 <= day_index <= len(schedule):
        return day_index

    # Older snapshots may not contain day_index. Match their title to the
    # program schedule, ignoring the appended load-phase suffix.
    workout_title = str(plan.get("title") or workout.title or "").split(" · ", 1)[0].strip().casefold()
    if not workout_title:
        return 0
    for position, raw_day in enumerate(schedule, start=1):
        if not isinstance(raw_day, dict):
            continue
        title = str(raw_day.get("name") or raw_day.get("title") or "").strip().casefold()
        if title and title == workout_title:
            try:
                explicit = int(raw_day.get("day_index", raw_day.get("day", position)))
            except (TypeError, ValueError):
                explicit = position
            return explicit if 1 <= explicit <= len(schedule) else position
    return 0


async def _rollback_program_cursor_for_deleted_workout(
    session: AsyncSession,
    user: User,
    workout: Workout,
) -> None:
    """Make a deleted program workout the next workout again.

    Deletion means that the program day is no longer completed. This must not
    depend on whether another workout was created later or whether a client-side
    cursor update arrived out of order.
    """
    if workout.program_id is None:
        return
    goals = dict(user.goals or {})
    if str(goals.get("active_program_id") or "") != str(workout.program_id):
        return
    program = await session.scalar(
        select(Program).where(Program.id == workout.program_id, Program.is_deleted.is_(False))
    )
    if program is None:
        return
    schedule = (program.structure or {}).get("schedule") or (program.structure or {}).get("days")
    if not isinstance(schedule, list) or not schedule:
        return
    day_index = _program_day_index(workout, schedule)
    if day_index < 1:
        return

    plan = workout.plan or {}
    phase = str(plan.get("week_phase") or "").strip().lower()
    if phase not in {"light", "medium", "heavy"}:
        current_phase = str(goals.get("active_program_week_phase") or "").strip().lower()
        phase = current_phase if current_phase in {"light", "medium", "heavy"} else "medium"

    goals["active_program_next_day"] = day_index
    goals["active_program_week_phase"] = phase
    goals["active_program_phase_source"] = "manual"
    # Before day N, exactly N-1 days of the split phase have been completed.
    goals["active_program_workouts_in_phase"] = day_index - 1
    user.goals = goals


async def get_workout(session: AsyncSession, user: User, workout_id: uuid.UUID) -> Workout:
    return await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)


async def update_workout_plan(
    session: AsyncSession,
    user: User,
    workout_id: uuid.UUID,
    data: WorkoutPlan,
) -> Workout:
    """Persist exercise replacements and keep empty set slots aligned with the plan."""
    workout = await _get_workout_for_user(session, workout_id=workout_id, user_id=user.id)
    if workout.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="План завершённой тренировки нельзя изменить",
        )

    plan = _normalize_plan(data)
    exercise_ids = [uuid.UUID(str(item["exercise_id"])) for item in plan["exercises"]]
    if len(exercise_ids) != len(set(exercise_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="В плане повторяются упражнения")
    await _load_exercises_map(session, exercise_ids)

    old_by_order = {
        int(item.get("order") or 0): uuid.UUID(str(item["exercise_id"]))
        for item in (workout.plan or {}).get("exercises", [])
        if item.get("exercise_id")
    }
    sets_by_slot = {(item.exercise_id, item.set_number): item for item in workout.sets}
    for item in plan["exercises"]:
        order = int(item.get("order") or 0)
        new_id = uuid.UUID(str(item["exercise_id"]))
        old_id = old_by_order.get(order)
        if old_id is None or old_id == new_id:
            continue
        for workout_set in workout.sets:
            if workout_set.exercise_id != old_id or workout_set.is_completed:
                continue
            collision = sets_by_slot.get((new_id, workout_set.set_number))
            if collision is not None:
                await session.delete(workout_set)
            else:
                sets_by_slot.pop((old_id, workout_set.set_number), None)
                workout_set.exercise_id = new_id
                sets_by_slot[(new_id, workout_set.set_number)] = workout_set

    workout.plan = plan
    await session.commit()
    await session.refresh(workout)
    return workout
