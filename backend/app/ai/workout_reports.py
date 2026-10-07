"""Bounded historical workout reports based entirely on verified records."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.analytics import _recovery_evidence
from app.models.exercise import Exercise
from app.models.user import User
from app.models.workout import Workout, WorkoutSet
from app.services.scheduler import local_schedule_day
from app.services.workout_metrics import aggregate_workout_load, normalized_set_volume

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


@dataclass(frozen=True)
class WorkoutReportEvidence:
    report: str
    facts: dict[str, str]
    has_data: bool


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


async def _exercise_lines(
    session: AsyncSession, workout: Workout,
) -> tuple[list[str], dict[uuid.UUID, str]]:
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
    return lines, names


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


def _groups(workout: Workout) -> dict[uuid.UUID, list[WorkoutSet]]:
    groups: dict[uuid.UUID, list[WorkoutSet]] = defaultdict(list)
    for item in _completed_sets(workout):
        groups[item.exercise_id].append(item)
    return groups


def _weighted_peak(sets: list[WorkoutSet]) -> tuple[float, int, list[int]] | None:
    weighted = [item for item in sets if normalized_set_volume(item) > 0]
    if not weighted:
        return None
    effective = [(float(item.weight) * (2 if item.weight_mode == "per_hand" else 1), item)
                 for item in weighted]
    peak = max(weight for weight, _item in effective)
    peak_reps = max(int(item.reps) for weight, item in effective if weight == peak)
    return peak, peak_reps, sorted(int(item.reps) for item in weighted)


def _comparison_fact(name: str, current: list[WorkoutSet], previous: list[WorkoutSet]) -> str:
    now, before = _weighted_peak(current), _weighted_peak(previous)
    if not now or not before:
        return f"{name}: нет взвешенных подходов в обеих записях; сравнение веса не выполнено."
    weight = "выше" if now[0] > before[0] else "ниже" if now[0] < before[0] else "одинаковый"
    reps = "больше" if now[1] > before[1] else "меньше" if now[1] < before[1] else "столько же"
    shape = "одинаковый" if now[2] == before[2] else "отличается"
    meaning = (
        " Режим нагрузки изменился; это не подтверждает улучшение силы или выносливости."
        if now[0] < before[0] and now[1] > before[1] else ""
    )
    return (
        f"{name}: максимальный суммарный вес {weight}; повторов при этом весе {reps}; "
        f"набор числа повторов по подходам {shape}.{meaning}"
    )


def _pattern_facts(groups: dict[uuid.UUID, list[WorkoutSet]], names: dict[uuid.UUID, str]) -> list[str]:
    stable, varying = [], []
    for exercise_id, sets in groups.items():
        weighted = sorted((item for item in sets if normalized_set_volume(item) > 0),
                          key=lambda item: item.set_number)
        if len(weighted) < 2:
            continue
        weights = {float(item.weight) * (2 if item.weight_mode == "per_hand" else 1)
                   for item in weighted}
        name = names.get(exercise_id, "Упражнение")[:60]
        if len(weights) > 1:
            text = "вес в записанных подходах различается; причина изменения не установлена"
        else:
            change = ("снизились" if weighted[-1].reps < weighted[0].reps else
                      "выросли" if weighted[-1].reps > weighted[0].reps else "не изменились")
            text = f"вес одинаковый; повторы к последнему подходу {change}"
        target = stable if len(weights) == 1 else varying
        target.append(f"В последнем занятии — {name}: {text}.")
    return (stable or varying)[:1]


async def _latest_facts(
    session: AsyncSession, user: User, current: Workout, names: dict[uuid.UUID, str],
) -> list[str]:
    lines = _latest_lines(current)
    facts = []
    groups = _groups(current)
    rows = list((await session.scalars(
        select(Workout).options(selectinload(Workout.sets)).where(
            Workout.user_id == user.id, Workout.is_deleted.is_(False),
            Workout.status == "completed",
            Workout.scheduled_date >= current.scheduled_date - timedelta(days=90),
            Workout.scheduled_date <= current.scheduled_date - timedelta(days=1),
        ).order_by(Workout.scheduled_date.desc(), Workout.completed_at.desc().nullslast(),
                   Workout.created_at.desc())
    )).all())
    baseline = next((row for row in rows if set(groups) & set(_groups(row))), None)
    if baseline is None:
        facts.append("Нет сопоставимой завершённой тренировки с теми же упражнениями за 90 дней.")
    else:
        previous = _groups(baseline)
        matching = [exercise_id for exercise_id in groups if exercise_id in previous][:2]
        facts.extend(f"Относительно предыдущей записи {baseline.scheduled_date} — "
                     + _comparison_fact(names.get(item, "Упражнение")[:60], groups[item], previous[item])
                     for item in matching)
    facts.extend(_pattern_facts(groups, names))
    facts.append("Выборка сравнений частичная, не вся сессия; техника по записям не оценена.")
    facts.append(f"{lines[0]} Подходов выполнено: {len(_completed_sets(current))}.")
    return facts


def _period_facts(lines: list[str], workouts: list[Workout], start: date, days: int) -> list[str]:
    facts = []
    if workouts and days >= 14:
        midpoint = start + timedelta(days=days // 2)
        halves = [[row for row in workouts if row.scheduled_date < midpoint],
                  [row for row in workouts if row.scheduled_date >= midpoint]]
        if not all(halves):
            facts.append(f"По половинам периода тренировок {len(halves[0])} и {len(halves[1])}; "
                         "в одной половине нет тренировок, изменение среднего объёма оценить нельзя.")
        else:
            averages = [aggregate_workout_load(item for row in half for item in _completed_sets(row))
                        .weighted_volume_kg_reps / len(half) for half in halves]
            volume = ("выше" if averages[1] > averages[0] else
                      "ниже" if averages[1] < averages[0] else "не изменился")
            count = ("увеличилось" if len(halves[1]) > len(halves[0]) else
                     "уменьшилось" if len(halves[1]) < len(halves[0]) else "не изменилось")
            facts.append(f"Во второй половине средний тоннаж на тренировку {volume}; "
                         f"число тренировок {count}: {len(halves[0])} → {len(halves[1])}.")
            if averages[1] > averages[0] and len(halves[0]) != len(halves[1]):
                facts.append("Средний объём занятия больше; это само по себе не подтверждает "
                             "рост силы, частоты или общей суммы тоннажа.")
    if workouts:
        if len(workouts) < 2:
            facts.append("Изменения между занятиями не сравнивались: в выборке одно занятие. "
                         "Объём самого занятия рассчитан; это не оценка его достаточности.")
        facts.append(" ".join(lines[:2]))
    else:
        facts.append(" ".join(lines))
    return facts


def _bounded_facts(values: list[str]) -> dict[str, str]:
    facts: dict[str, str] = {}
    used = 0
    for value in values:
        key = f"F{len(facts) + 1}"
        size = len(key) + len(value)
        if len(facts) == 12 or used + size > 2200:
            break
        facts[key] = value
        used += size
    return facts


async def build_workout_evidence(
    session: AsyncSession,
    user: User,
    *,
    message: str,
    days: int,
    today: date | None = None,
) -> WorkoutReportEvidence:
    """Select real history once and expose bounded facts for an LLM to interpret."""
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
    has_recovery = False
    if latest:
        if workouts:
            lines = _latest_lines(workouts[0])
            exercise_lines, names = await _exercise_lines(session, workouts[0])
            facts = await _latest_facts(session, user, workouts[0], names)
        else:
            lines = ["До сегодняшнего дня нет завершённых тренировок для разбора."]
            facts = list(lines)
    else:
        lines = _period_lines(workouts, start, end, days)
        facts = _period_facts(lines, workouts, start, days)
    if include_recovery_requested(message):
        recovery, has_recovery = await _recovery_evidence(
            session, user, start=start, end=end, days=days,
        )
        lines.append(f"Восстановление за {days} дней ({start} — {end}):")
        lines.extend(recovery if has_recovery else ["Нет записей восстановления за этот период."])
        recovery_fact = f"Восстановление за {days} дней ({start} — {end}): " + " ".join(
            recovery if has_recovery else ["Нет записей восстановления за этот период."]
        )
        coverage = [int(count) for line in recovery
                    for count in re.findall(r"заполнено (\d+) из \d+ дней", line)]
        if has_recovery and (len(coverage) < 4 or any(count < days for count in coverage)):
            recovery_fact += (" Оценка неполная: заполнены не все дни или показатели; средние сами "
                              "по себе не доказывают низкое или несбалансированное восстановление.")
        facts.append(recovery_fact)
    return WorkoutReportEvidence(
        report=_bounded_report(lines, exercise_lines), facts=_bounded_facts(facts),
        has_data=bool(workouts) or has_recovery,
    )


async def build_workout_report(
    session: AsyncSession, user: User, *, message: str, days: int, today: date | None = None,
) -> str:
    evidence = await build_workout_evidence(session, user, message=message, days=days, today=today)
    return evidence.report
