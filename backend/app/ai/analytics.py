"""Query classification and bounded evidence for the local AI trainer."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.body_measurement import BodyMeasurement
from app.models.daily_metric import DailyMetric
from app.models.exercise import Exercise
from app.models.user import User
from app.models.workout import Workout
from app.services.energy_targets import compute_energy_targets
from app.services.nutrition_service import range_daily_totals
from app.services.notification_prefs import water_ml_for_day
from app.services.workout_metrics import aggregate_workout_load, normalized_set_volume


class AIQueryDomain(StrEnum):
    WORKOUT_PROGRESS = "workout_progress"
    STRENGTH = "strength"
    MEASUREMENTS = "measurements"
    WEIGHT = "weight"
    NUTRITION = "nutrition"
    RECOVERY = "recovery"
    SAFETY = "safety"
    GENERAL = "general"


@dataclass(frozen=True)
class AnalysisEvidence:
    domain: AIQueryDomain
    days: int
    text: str
    has_data: bool


_DOMAIN_PATTERNS: tuple[tuple[AIQueryDomain, re.Pattern[str]], ...] = (
    (AIQueryDomain.SAFETY, re.compile(r"бол|травм|от[её]к|дыш|сознани|кровотеч", re.I)),
    (AIQueryDomain.MEASUREMENTS, re.compile(r"тали|бед[её]р|груд|бицеп|икр|ше[ия]|обхват|замер", re.I)),
    (AIQueryDomain.STRENGTH, re.compile(r"жим|присед|тяг|подтяг|сил[аыу]|рабоч.*вес|1пм|повторн.*макс", re.I)),
    (AIQueryDomain.WEIGHT, re.compile(r"вес|похуд|сброс|набрал[аи]?\s+кг|килограмм", re.I)),
    (AIQueryDomain.NUTRITION, re.compile(r"питан|калори|белк|жир|углевод|бжу|рацион|\b(?:ел|ела|ели)\b|что\s+(?:мне\s+)?(?:есть|поесть)", re.I)),
    (AIQueryDomain.RECOVERY, re.compile(r"восстанов|сон|спал|спала|шаг|активн|вод[аыу]|устал", re.I)),
    (AIQueryDomain.WORKOUT_PROGRESS, re.compile(r"трениров|прогресс|объ[её]м|подход|rpe|разбор", re.I)),
)


def classify_ai_query(message: str) -> AIQueryDomain:
    for domain, pattern in _DOMAIN_PATTERNS:
        if pattern.search(message):
            return domain
    return AIQueryDomain.GENERAL


def extract_period_days(message: str, *, default: int = 14) -> int:
    text = message.casefold()
    named = (
        (r"полугод|6\s*месяц", 180),
        (r"год|12\s*месяц", 365),
        (r"квартал|3\s*месяц", 90),
        (r"месяц", 30),
        (r"две\s+недел|2\s*недел", 14),
        (r"недел", 7),
    )
    for pattern, days in named:
        if re.search(pattern, text):
            return days
    match = re.search(r"(?:за|последн\w*)\s+(\d{1,3})\s*(?:дн|день|дня|дней)", text)
    if match:
        return max(1, min(365, int(match.group(1))))
    return max(1, min(365, default))


def _fmt(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


async def _measurement_evidence(
    session: AsyncSession,
    user: User,
    *,
    start: date,
    domain: AIQueryDomain,
) -> tuple[list[str], bool]:
    rows = list((await session.scalars(
        select(BodyMeasurement)
        .where(
            BodyMeasurement.user_id == user.id,
            BodyMeasurement.date >= start,
            BodyMeasurement.is_deleted.is_(False),
        )
        .order_by(BodyMeasurement.date.asc())
    )).all())
    fields = {"weight_kg": "вес"} if domain == AIQueryDomain.WEIGHT else {
        "neck_cm": "шея", "shoulders_cm": "плечи", "chest_cm": "грудь",
        "waist_cm": "талия", "hips_cm": "бёдра", "bicep_cm": "бицепс",
        "thigh_cm": "бедро", "calf_cm": "икра",
    }
    lines: list[str] = []
    for field, label in fields.items():
        points = [(row.date, float(value)) for row in rows if (value := getattr(row, field)) is not None]
        if not points:
            continue
        first, latest = points[0], points[-1]
        unit = "кг" if field == "weight_kg" else "см"
        lines.append(
            f"{label}: {first[1]:g} {unit} ({first[0].isoformat()}) → "
            f"{latest[1]:g} {unit} ({latest[0].isoformat()}), "
            f"изменение {_fmt(latest[1] - first[1])} {unit}, точек {len(points)}"
        )
    return lines, bool(lines)


async def _nutrition_evidence(
    session: AsyncSession, user: User, *, start: date, end: date, days: int,
) -> tuple[list[str], bool]:
    daily = await range_daily_totals(session, user, start=start, end=end)
    filled = [row for row in daily if row["has_logs"]]
    if not filled:
        return [], False
    keys = (("calories", "ккал"), ("proteins", "белки"), ("fats", "жиры"), ("carbs", "углеводы"))
    lines = [f"питание заполнено: {len(filled)} из {days} дней"]
    for key, label in keys:
        average = sum(float(row[key]) for row in filled) / len(filled)
        lines.append(f"среднее за заполненный день — {label}: {_fmt(average)}")
    targets = compute_energy_targets(user.anthropometry or {}, user.goals or {}, today=end)
    if targets.get("complete"):
        lines.append(
            f"расчётная цель: {targets['calories_target']:g} ккал; "
            f"Б/Ж/У {targets['macros']['proteins_g']:g}/"
            f"{targets['macros']['fats_g']:g}/{targets['macros']['carbs_g']:g} г"
        )
    else:
        lines.append("расчётная цель калорий недоступна: профиль заполнен не полностью")
    return lines, True


async def _recovery_evidence(
    session: AsyncSession, user: User, *, start: date, end: date, days: int,
) -> tuple[list[str], bool]:
    rows = list((await session.scalars(
        select(DailyMetric)
        .where(
            DailyMetric.user_id == user.id,
            DailyMetric.date >= start,
            DailyMetric.date <= end,
            DailyMetric.is_deleted.is_(False),
        )
        .order_by(DailyMetric.date.asc())
    )).all())
    lines: list[str] = []
    sleep = [row.sleep_minutes for row in rows if row.sleep_minutes is not None]
    steps = [row.steps for row in rows if row.steps is not None]
    active = [row.active_minutes for row in rows if row.active_minutes is not None]
    if sleep:
        lines.append(f"сон: в среднем {_fmt(sum(sleep) / len(sleep) / 60)} ч, заполнено {len(sleep)} из {days} дней")
    if steps:
        lines.append(f"шаги: в среднем {round(sum(steps) / len(steps))}, заполнено {len(steps)} из {days} дней")
    if active:
        lines.append(f"активность: в среднем {round(sum(active) / len(active))} мин, заполнено {len(active)} из {days} дней")
    water = [water_ml_for_day(user.goals or {}, start + timedelta(days=offset)) for offset in range(days)]
    water = [value for value in water if value > 0]
    if water:
        lines.append(f"вода: в среднем {round(sum(water) / len(water))} мл, заполнено {len(water)} из {days} дней")
    return lines, bool(lines)


async def _workout_evidence(
    session: AsyncSession, user: User, *, start: date, domain: AIQueryDomain,
) -> tuple[list[str], bool]:
    workouts = list((await session.scalars(
        select(Workout)
        .options(selectinload(Workout.sets))
        .where(
            Workout.user_id == user.id,
            Workout.scheduled_date >= start,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
        .order_by(Workout.scheduled_date.asc())
    )).all())
    if not workouts:
        return [], False
    sets = [item for workout in workouts for item in workout.sets]
    load = aggregate_workout_load(sets)
    rpe = [float(workout.rpe) for workout in workouts if workout.rpe is not None]
    lines = [
        f"завершённые тренировки: {len(workouts)}",
        f"взвешенные подходы: {load.weighted_sets}; тоннаж {_fmt(load.weighted_volume_kg_reps)} кг·повт",
        f"подходы без веса: {load.reps_only_sets}, повторов {load.reps_only_reps}",
        f"подходы по времени: {load.timed_sets}, всего {load.timed_seconds} сек",
        f"средний RPE: {_fmt(sum(rpe) / len(rpe)) if rpe else 'нет данных'}",
    ]
    if domain == AIQueryDomain.STRENGTH:
        exercise_ids = {item.exercise_id for item in sets if normalized_set_volume(item) > 0}
        names: dict[uuid.UUID, str] = {}
        if exercise_ids:
            exercises = await session.scalars(select(Exercise).where(Exercise.id.in_(exercise_ids)))
            names = {item.id: item.name_ru for item in exercises.all()}
        best: dict[uuid.UUID, float] = {}
        for item in sets:
            volume = normalized_set_volume(item)
            reps = int(item.reps or 0)
            if volume <= 0 or reps <= 0:
                continue
            total_weight = float(item.weight or 0) * (2 if item.weight_mode == "per_hand" else 1)
            estimate = total_weight * (1 + reps / 30)
            best[item.exercise_id] = max(best.get(item.exercise_id, 0), estimate)
        for exercise_id, estimate in sorted(best.items(), key=lambda pair: pair[1], reverse=True)[:6]:
            lines.append(f"{names.get(exercise_id, 'Упражнение')}: лучший расчётный 1ПМ {_fmt(estimate)} кг")
    return lines, True


async def build_analysis_evidence(
    session: AsyncSession,
    user: User,
    *,
    domain: AIQueryDomain,
    days: int,
    today: date | None = None,
) -> AnalysisEvidence:
    end = today or date.today()
    start = end - timedelta(days=days - 1)
    if domain in {AIQueryDomain.MEASUREMENTS, AIQueryDomain.WEIGHT}:
        lines, has_data = await _measurement_evidence(session, user, start=start, domain=domain)
    elif domain == AIQueryDomain.NUTRITION:
        lines, has_data = await _nutrition_evidence(session, user, start=start, end=end, days=days)
    elif domain == AIQueryDomain.RECOVERY:
        lines, has_data = await _recovery_evidence(session, user, start=start, end=end, days=days)
    else:
        lines, has_data = await _workout_evidence(session, user, start=start, domain=domain)
    heading = f"Проверяемый домен: {domain.value}; период: {days} дней ({start}—{end})."
    return AnalysisEvidence(domain=domain, days=days, text="\n".join([heading, *lines]), has_data=has_data)


def missing_data_question(domain: AIQueryDomain, days: int) -> str:
    questions = {
        AIQueryDomain.MEASUREMENTS: "За выбранный период нет замеров. Добавите хотя бы два замера нужного обхвата?",
        AIQueryDomain.WEIGHT: "За выбранный период нет записей веса. Добавите хотя бы два замера веса?",
        AIQueryDomain.NUTRITION: "За выбранный период дневник питания пуст. Заполните хотя бы два дня и повторите вопрос?",
        AIQueryDomain.RECOVERY: "За выбранный период нет записей восстановления. Заполните сон, шаги или воду хотя бы за два дня?",
        AIQueryDomain.STRENGTH: "За выбранный период нет завершённых подходов с весом. Запишете рабочие подходы нужного упражнения?",
        AIQueryDomain.WORKOUT_PROGRESS: "За выбранный период нет завершённых тренировок. Вы хотите разобрать более длинный период?",
    }
    return questions.get(domain, f"За {days} дней данных недостаточно. Уточните, какой показатель разобрать?")
