"""Bounded historical workout reports based entirely on verified records."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.analytics import _recovery_evidence
from app.models.exercise import Exercise
from app.models.user import User
from app.models.workout import Workout, WorkoutSet
from app.services.scheduler import local_schedule_day
from app.services.workout_metrics import aggregate_workout_load

_LATEST = re.compile(
    r"\b(?:последн(?:яя|юю|ей)|предыдущ(?:ая|ую|ей)|прошл(?:ая|ую|ой)|"
    r"заверш[её]нн(?:ая|ую|ой))\s+(?:(?:заверш[её]нн\w*|выполненн\w*|мою)\s+)?"
    r"тренировк(?:а|у|е|ой|и)\b",
    re.IGNORECASE,
)
_RECOVERY = re.compile(
    r"восстанов|\bсон\b|\bс(?:на|ну|не|ном)\b|спал|спала|шаг|активност|воду|воды|устал",
    re.IGNORECASE,
)
_MAX_REPORT_CHARS = 2000


def latest_workout_requested(message: str) -> bool:
    """A singular previous/completed workout has no arbitrary period cutoff."""
    return bool(_LATEST.search(message))


def include_recovery_requested(message: str) -> bool:
    return bool(_RECOVERY.search(message))


def _number(value: float | int) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".").replace(".", ",")


def _completed_sets(workout: Workout) -> list[WorkoutSet]:
    return [item for item in workout.sets if item.is_completed and not item.is_deleted]


def _load_lines(workouts: list[Workout]) -> list[str]:
    sets = [item for workout in workouts for item in _completed_sets(workout)]
    load = aggregate_workout_load(sets)
    return [
        f"Подходов выполнено: {len(sets)}; с весом: {load.weighted_sets}.",
        f"Тоннаж: {_number(load.weighted_volume_kg_reps)} кг·повт.",
        f"Без веса: {load.reps_only_sets} подходов, {load.reps_only_reps} повторов; "
        f"по времени: {load.timed_sets} подходов, {load.timed_seconds} сек.",
    ]


def _set_detail(item: WorkoutSet) -> str:
    if item.duration_sec:
        return f"{item.duration_sec} сек"
    if item.weight and item.weight > 0:
        mode = " (на гантель)" if item.weight_mode == "per_hand" else ""
        weight = f"{item.weight:.2f}".rstrip("0").rstrip(".").replace(".", ",")
        return f"{weight} кг × {item.reps or 0}{mode}"
    return f"{item.reps or 0} повторов без веса"


async def _exercise_lines(session: AsyncSession, workout: Workout) -> list[str]:
    grouped: dict[uuid.UUID, list[WorkoutSet]] = defaultdict(list)
    for item in _completed_sets(workout):
        grouped[item.exercise_id].append(item)
    names: dict[uuid.UUID, str] = {}
    for item in (workout.plan or {}).get("exercises", []):
        if not isinstance(item, dict):
            continue
        try:
            exercise_id = uuid.UUID(str(item.get("exercise_id") or ""))
        except ValueError:
            continue
        name = str(item.get("name_ru") or item.get("exercise_name") or "").strip()
        if name:
            names[exercise_id] = name
    missing = set(grouped) - set(names)
    if missing:
        rows = await session.scalars(select(Exercise).where(Exercise.id.in_(missing)))
        names.update({item.id: item.name_ru for item in rows.all()})
    lines = []
    for exercise_id, sets in grouped.items():
        ordered = sorted(sets, key=lambda item: item.set_number)
        values = "; ".join(_set_detail(item) for item in ordered[:6])
        extra = f"; ещё {len(ordered) - 6} подходов" if len(ordered) > 6 else ""
        name = names.get(exercise_id, "Упражнение")[:100]
        lines.append(f"• {name}: {len(ordered)} подходов — {values}{extra}.")
    return lines


def _latest_lines(workout: Workout) -> list[str]:
    title = (workout.title or (workout.plan or {}).get("title") or "Тренировка")[:120]
    lines = [f"Последняя завершённая тренировка: {workout.scheduled_date} — {title}."]
    lines.extend(_load_lines([workout]))
    rpe = f"{workout.rpe}/10" if workout.rpe is not None else "не записан"
    duration = (
        f"{workout.duration_sec // 60} мин {workout.duration_sec % 60} сек"
        if workout.duration_sec is not None else "не записана"
    )
    lines.append(f"RPE: {rpe}; длительность: {duration}.")
    lines.append(
        "Следующий шаг: сравните одинаковые упражнения и подходы перед повышением веса; "
        "учтите технику и RPE."
    )
    return lines


def _half_line(label: str, workouts: list[Workout]) -> str:
    load = aggregate_workout_load(item for workout in workouts for item in _completed_sets(workout))
    total = load.weighted_volume_kg_reps
    average = _number(total / len(workouts)) if workouts else "нет данных"
    return (
        f"{label}: тренировок {len(workouts)}, всего {_number(total)} кг·повт; "
        f"среднее на тренировку: {average}" + (" кг·повт." if workouts else ".")
    )


def _period_lines(workouts: list[Workout], start: date, end: date, days: int) -> list[str]:
    lines = [f"Разбор за {days} дней: {start} — {end}.", f"Тренировок: {len(workouts)}."]
    if not workouts:
        lines.append("В этом периоде нет завершённых тренировок.")
        return lines
    lines.extend(_load_lines(workouts))
    rpe = [row.rpe for row in workouts if row.rpe is not None]
    average = f"{_number(sum(rpe) / len(rpe))}/10" if rpe else "не записан"
    lines.append(f"Средний RPE: {average}; заполнено {len(rpe)} из {len(workouts)} тренировок.")
    if days > 1:
        midpoint = start + timedelta(days=days // 2)
        first = [row for row in workouts if row.scheduled_date < midpoint]
        second = [row for row in workouts if row.scheduled_date >= midpoint]
        lines.append(_half_line("Первая половина периода", first))
        lines.append(_half_line("Вторая половина периода", second))
        lines.append("Тоннаж показывает объём работы, а не рост силы; число тренировок тоже влияет на итог.")
    return lines


def _bounded_report(lines: list[str], exercise_lines: list[str]) -> str:
    report = "\n".join(lines)
    marker = "\nПодробности упражнений показаны частично."
    for index, line in enumerate(exercise_lines):
        if len(report) + len(line) + len(marker) + 1 > _MAX_REPORT_CHARS:
            return report + marker
        report += "\n" + line
        if index == len(exercise_lines) - 1:
            break
    return report


async def build_workout_report(
    session: AsyncSession,
    user: User,
    *,
    message: str,
    days: int,
    today: date | None = None,
) -> str:
    """Select completed records and render facts without asking an LLM to infer history."""
    end = today or local_schedule_day(user.goals or {})
    days = max(1, min(365, days))
    start = end - timedelta(days=days - 1)
    latest = latest_workout_requested(message)
    query = (
        select(Workout).options(selectinload(Workout.sets))
        .where(
            Workout.user_id == user.id,
            Workout.is_deleted.is_(False),
            Workout.status == "completed",
            Workout.scheduled_date <= end,
        )
    )
    if latest:
        query = query.order_by(
            Workout.scheduled_date.desc(), Workout.completed_at.desc().nullslast(),
            Workout.created_at.desc(),
        ).limit(1)
    else:
        query = query.where(Workout.scheduled_date >= start).order_by(Workout.scheduled_date.asc())
    workouts = list((await session.scalars(query)).all())
    exercise_lines = []
    if latest:
        if workouts:
            lines = _latest_lines(workouts[0])
            exercise_lines = await _exercise_lines(session, workouts[0])
        else:
            lines = ["До сегодняшнего дня нет завершённых тренировок для разбора."]
    else:
        lines = _period_lines(workouts, start, end, days)
    if include_recovery_requested(message):
        recovery, has_recovery = await _recovery_evidence(
            session, user, start=start, end=end, days=days,
        )
        lines.append(f"Восстановление за {days} дней ({start} — {end}):")
        lines.extend(recovery if has_recovery else ["Нет записей восстановления за этот период."])
    return _bounded_report(lines, exercise_lines)
