"""Authoritative application context supplied to the AI trainer."""

from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai_conversation import AIConversation
from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout, WorkoutSet


def _list_text(value: object) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value) or "не указано"
    return str(value or "не указано")


def _number(value: Decimal | int | float | None) -> str:
    if value is None:
        return "0"
    text = format(value, "f") if isinstance(value, Decimal) else str(value)
    return text.rstrip("0").rstrip(".") if "." in text else text


def _profile_context(goals: dict, anthropometry: dict) -> str:
    return (
        f"Профиль: цель={goals.get('primary_goal') or 'не указана'}, "
        f"уровень={goals.get('level') or 'не указан'}, "
        f"вес={anthropometry.get('weight_kg') or 'не указан'} кг, "
        f"желаемый вес={goals.get('target_weight_kg') or 'не указан'} кг, "
        f"активность={goals.get('activity_level') or anthropometry.get('activity_level') or 'не указана'}, "
        f"тренировок в неделю={goals.get('days_per_week') or 'не указано'}, "
        f"коррекция калорий={goals.get('calorie_adjustment_pct') if goals.get('calorie_adjustment_pct') is not None else 'не указана'}%, "
        f"место={goals.get('location') or 'не указано'}, "
        f"оборудование={_list_text(goals.get('equipment'))}, "
        f"ограничения={_list_text(goals.get('limitations'))}."
    )


async def _active_program(session: AsyncSession, user: User) -> Program | None:
    raw_id = str((user.goals or {}).get("active_program_id") or "")
    try:
        program_id = uuid.UUID(raw_id)
    except ValueError:
        return None
    return await session.scalar(
        select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
    )


def _program_context(program: Program | None, goals: dict) -> list[str]:
    if program is None:
        return ["Активная программа: не выбрана или недоступна."]
    structure = program.structure or {}
    schedule = structure.get("schedule") or structure.get("days") or []
    try:
        next_day = max(1, int(goals.get("active_program_next_day") or 1))
    except (TypeError, ValueError):
        next_day = 1
    day = schedule[next_day - 1] if isinstance(schedule, list) and next_day <= len(schedule) else {}
    day = day if isinstance(day, dict) else {}
    rows = day.get("exercises") or []
    exercises = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        name = str(item.get("exercise_name") or item.get("name_ru") or "").strip()
        if not name:
            continue
        sets = item.get("sets") or item.get("target_sets") or "?"
        reps = item.get("reps") or item.get("target_reps") or "?"
        exercises.append(f"{name} ({sets}×{reps})")
    phase = str(goals.get("active_program_week_phase") or "не указана")
    return [
        f"Активная программа: {program.name}.",
        f"Следующий день программы: {next_day} — {day.get('name') or day.get('title') or 'без названия'}; фаза: {phase}.",
        "План следующего дня: " + ("; ".join(exercises) if exercises else "нет данных"),
    ]


def _plan_exercises(workout: Workout) -> list[dict]:
    plan = workout.plan or {}
    rows = plan.get("exercises") or []
    return [item for item in rows if isinstance(item, dict)]


def _format_workout(workout: Workout, exercise_names: dict[uuid.UUID, str]) -> list[str]:
    plan_rows = _plan_exercises(workout)
    plan_names = {
        str(item.get("exercise_id") or ""): str(item.get("name_ru") or "").strip()
        for item in plan_rows
    }
    grouped: dict[str, list[WorkoutSet]] = defaultdict(list)
    for workout_set in sorted(workout.sets, key=lambda item: item.set_number):
        grouped[str(workout_set.exercise_id)].append(workout_set)

    exercise_lines: list[str] = []
    ordered_ids = [str(item.get("exercise_id") or "") for item in plan_rows]
    for exercise_id, sets in grouped.items():
        if exercise_id not in ordered_ids and any(item.is_completed for item in sets):
            ordered_ids.append(exercise_id)
    for exercise_id in ordered_ids:
        if not exercise_id:
            continue
        name = plan_names.get(exercise_id)
        try:
            name = name or exercise_names.get(uuid.UUID(exercise_id))
        except ValueError:
            pass
        name = name or "Неизвестное упражнение"
        plan_item = next(
            (item for item in plan_rows if str(item.get("exercise_id") or "") == exercise_id),
            {},
        )
        original_id = str(plan_item.get("original_exercise_id") or "")
        if original_id and original_id != exercise_id:
            try:
                original_name = exercise_names.get(uuid.UUID(original_id))
            except ValueError:
                original_name = None
            name = f"{name} (замена вместо {original_name or 'исходного упражнения'})"
        sets = grouped.get(exercise_id, [])
        completed = [item for item in sets if item.is_completed]
        if completed:
            values = []
            for item in completed:
                if item.duration_sec:
                    values.append(f"{item.duration_sec} сек")
                else:
                    weight_label = " (на гантель)" if item.weight_mode == "per_hand" else ""
                    values.append(f"{_number(item.weight)} кг × {item.reps or 0}{weight_label}")
            exercise_lines.append(
                f"{name}: выполнено {len(completed)}/{len(sets)}; " + ", ".join(values)
            )
            continue
        target_sets = plan_item.get("target_sets") or len(sets) or "?"
        target_reps = plan_item.get("target_reps") or "?"
        exercise_lines.append(f"{name}: план {target_sets}×{target_reps}, выполненных подходов нет")

    duration = f", длительность {workout.duration_sec // 60} мин" if workout.duration_sec else ""
    rpe = f", RPE {workout.rpe}/10" if workout.rpe is not None else ""
    heading = (
        f"{workout.scheduled_date.isoformat()} — {workout.title or (workout.plan or {}).get('title') or 'Тренировка'}"
        f"; статус {workout.status}{duration}{rpe}."
    )
    return [heading, *(f"  - {line}" for line in exercise_lines)]


async def build_application_context(session: AsyncSession, user: User) -> str:
    """Build profile, active program and recent workout context without guesses."""
    goals = user.goals or {}
    anthropometry = user.anthropometry or {}
    program = await _active_program(session, user)
    lines = [
        "ДАННЫЕ ПРИЛОЖЕНИЯ — единственный источник правды о пользователе:",
        f"Пользователь: {user.username or 'без имени'}.",
        _profile_context(goals, anthropometry),
        *_program_context(program, goals),
    ]

    workouts = list(
        (
            await session.scalars(
                select(Workout)
                .options(selectinload(Workout.sets))
                .where(Workout.user_id == user.id, Workout.is_deleted.is_(False))
                .order_by(Workout.scheduled_date.desc(), Workout.created_at.desc())
                .limit(3)
            )
        ).all()
    )
    exercise_ids = {
        workout_set.exercise_id
        for workout in workouts
        for workout_set in workout.sets
    }
    for workout in workouts:
        for item in _plan_exercises(workout):
            for key in ("exercise_id", "original_exercise_id"):
                try:
                    exercise_ids.add(uuid.UUID(str(item.get(key) or "")))
                except ValueError:
                    pass
    exercise_names: dict[uuid.UUID, str] = {}
    if exercise_ids:
        rows = await session.scalars(select(Exercise).where(Exercise.id.in_(exercise_ids)))
        exercise_names = {item.id: item.name_ru for item in rows.all()}

    lines.append("Последние тренировки и фактические подходы:")
    if not workouts:
        lines.append("История тренировок пуста.")
    for workout in workouts:
        lines.extend(_format_workout(workout, exercise_names))
    return "\n".join(lines)


async def conversation_history(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    limit: int = 8,
) -> list[dict[str, str]]:
    rows = list(
        (
            await session.scalars(
                select(AIConversation)
                .where(
                    AIConversation.user_id == user_id,
                    AIConversation.session_id == session_id,
                    AIConversation.is_deleted.is_(False),
                )
                .order_by(AIConversation.timestamp.desc())
                .limit(limit)
            )
        ).all()
    )
    return [
        {"role": row.role, "content": row.content}
        for row in reversed(rows)
        if row.role in {"user", "assistant"}
    ]
