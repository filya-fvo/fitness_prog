"""Custom friend competition baselines, fair metrics and private analytics."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import median
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.body_measurement import BodyMeasurement
from app.models.exercise import Exercise
from app.models.social import Competition, CompetitionParticipant
from app.models.workout import Workout, WorkoutSet
from app.schemas.social import CompetitionFactor
from app.services.competition_scoring import regularity_score
from app.services.workout_metrics import normalized_set_volume

Metric = Literal["regularity", "weight_loss", "waist_reduction", "relative_strength"]
ALGORITHM_VERSION = "friend_factors_v2"
MAX_IMPROVEMENT_PERCENT = 200.0
MEASUREMENT_BASELINE_MAX_AGE_DAYS = 7

METRIC_LABELS: dict[str, str] = {
    "regularity": "Выполнение личного плана",
    "weight_loss": "Снижение веса",
    "waist_reduction": "Уменьшение талии",
    "relative_strength": "Относительная сила",
}


class CompetitionFactorError(RuntimeError):
    pass


class CompetitionBaselineError(CompetitionFactorError):
    pass


@dataclass(slots=True, frozen=True)
class FactorDefinition:
    key: str
    metric: Metric
    label: str
    exercise_id: uuid.UUID | None = None


@dataclass(slots=True)
class FactorResult:
    definition: FactorDefinition
    status: Literal["ready", "baseline_missing", "no_progress"]
    value: float | None = None
    completed: int | None = None
    planned: int | None = None
    baseline_value: float | None = None
    latest_value: float | None = None
    baseline_date: date | None = None
    latest_date: date | None = None
    unit: str | None = None
    capped: bool = False


@dataclass(slots=True)
class ParticipantAnalytics:
    factors: list[FactorResult] = field(default_factory=list)
    wins: int = 0


def factor_key(metric: str, exercise_id: uuid.UUID | str | None = None) -> str:
    return f"{metric}:{exercise_id}" if exercise_id else metric


def competition_factors(competition: Competition) -> list[CompetitionFactor]:
    raw = competition.factors if isinstance(competition.factors, list) else None
    if not raw:
        raw = [{"metric": competition.metric or "regularity"}]
    result: list[CompetitionFactor] = []
    for item in raw:
        try:
            result.append(CompetitionFactor.model_validate(item))
        except (TypeError, ValueError):
            continue
    return result or [CompetitionFactor(metric="regularity")]


async def factor_definitions(
    session: AsyncSession,
    competition: Competition,
) -> list[FactorDefinition]:
    factors = competition_factors(competition)
    exercise_ids = [item.exercise_id for item in factors if item.exercise_id is not None]
    names: dict[uuid.UUID, str] = {}
    if exercise_ids:
        rows = await session.execute(
            select(Exercise.id, Exercise.name_ru).where(
                Exercise.id.in_(exercise_ids), Exercise.is_deleted.is_(False)
            )
        )
        names = {exercise_id: name for exercise_id, name in rows.all()}
        if len(names) != len(set(exercise_ids)):
            raise CompetitionFactorError("Выбранное упражнение больше недоступно")
    return [
        FactorDefinition(
            key=item.key,
            metric=item.metric,
            label=(
                f"Относительная сила · {names.get(item.exercise_id, 'упражнение')}"
                if item.metric == "relative_strength"
                else METRIC_LABELS[item.metric]
            ),
            exercise_id=item.exercise_id,
        )
        for item in factors
    ]


def _safe_date(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def estimated_one_rep_max(load_kg: float, reps: int) -> float:
    """Epley e1RM for comparable weighted sets in the safe 1-12 rep range."""
    if load_kg <= 0 or not 1 <= reps <= 12:
        raise ValueError("load and reps are outside the supported range")
    return round(load_kg * (1 + reps / 30), 3)


def improvement_percent(baseline: float, latest: float, *, decrease: bool = False) -> tuple[float, bool]:
    if baseline <= 0:
        raise ValueError("baseline must be positive")
    raw = 100 * ((baseline - latest) if decrease else (latest - baseline)) / baseline
    capped = raw > MAX_IMPROVEMENT_PERCENT
    return round(max(-100.0, min(MAX_IMPROVEMENT_PERCENT, raw)), 1), capped


async def _latest_measurement(
    session: AsyncSession,
    user_id: uuid.UUID,
    field_name: Literal["weight_kg", "waist_cm"],
    on_or_before: date,
) -> tuple[float, date] | None:
    column = getattr(BodyMeasurement, field_name)
    row = await session.execute(
        select(column, BodyMeasurement.date)
        .where(
            BodyMeasurement.user_id == user_id,
            BodyMeasurement.date <= on_or_before,
            column.is_not(None),
            BodyMeasurement.is_deleted.is_(False),
        )
        .order_by(BodyMeasurement.date.desc(), BodyMeasurement.updated_at.desc())
        .limit(1)
    )
    value = row.first()
    return (float(value[0]), value[1]) if value is not None else None


async def _best_lift(
    session: AsyncSession,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    start: date,
    end: date,
) -> dict[str, object] | None:
    rows = await session.execute(
        select(WorkoutSet, Workout.scheduled_date)
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.scheduled_date >= start,
            Workout.scheduled_date <= end,
            Workout.is_deleted.is_(False),
            WorkoutSet.exercise_id == exercise_id,
            WorkoutSet.is_completed.is_(True),
            WorkoutSet.is_deleted.is_(False),
            WorkoutSet.reps >= 1,
            WorkoutSet.reps <= 12,
            WorkoutSet.weight > 0,
        )
    )
    by_day: dict[date, list[dict[str, object]]] = {}
    for workout_set, workout_date in rows.all():
        reps = int(workout_set.reps or 0)
        load = normalized_set_volume(workout_set) / reps if reps else 0
        if load <= 0:
            continue
        e1rm = estimated_one_rep_max(load, reps)
        by_day.setdefault(workout_date, []).append(
            {
                "e1rm": e1rm,
                "load": round(load, 2),
                "reps": reps,
                "date": workout_date,
            }
        )
    best: dict[str, object] | None = None
    for workout_date, attempts in by_day.items():
        strongest = sorted(attempts, key=lambda item: float(item["e1rm"]), reverse=True)[:3]
        stable_e1rm = round(median(float(item["e1rm"]) for item in strongest), 3)
        representative = min(strongest, key=lambda item: abs(float(item["e1rm"]) - stable_e1rm))
        candidate = {**representative, "e1rm": stable_e1rm, "date": workout_date}
        if best is None or stable_e1rm > float(best["e1rm"]):
            best = candidate
    return best


async def _strength_snapshot(
    session: AsyncSession,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    start: date,
    end: date,
) -> dict[str, object] | None:
    lift = await _best_lift(session, user_id, exercise_id, start, end)
    if lift is None:
        return None
    lift_date = lift["date"]
    assert isinstance(lift_date, date)
    body_weight = await _latest_measurement(session, user_id, "weight_kg", lift_date)
    if body_weight is None:
        return None
    if (lift_date - body_weight[1]).days > MEASUREMENT_BASELINE_MAX_AGE_DAYS:
        return None
    relative = float(lift["e1rm"]) / body_weight[0]
    return {
        **lift,
        "date": lift["date"].isoformat(),
        "body_weight": round(body_weight[0], 2),
        "body_weight_date": body_weight[1].isoformat(),
        "relative_e1rm": round(relative, 5),
    }


async def capture_participant_baseline(
    session: AsyncSession,
    participant: CompetitionParticipant,
    definitions: list[FactorDefinition],
    start_date: date,
) -> dict[str, object]:
    baseline: dict[str, object] = {}
    missing: list[str] = []
    for definition in definitions:
        if definition.metric == "regularity":
            continue
        if definition.metric in ("weight_loss", "waist_reduction"):
            field_name = "weight_kg" if definition.metric == "weight_loss" else "waist_cm"
            point = await _latest_measurement(session, participant.user_id, field_name, start_date)
            if point is None or (start_date - point[1]).days > MEASUREMENT_BASELINE_MAX_AGE_DAYS:
                missing.append(definition.label)
                continue
            baseline[definition.key] = {"value": round(point[0], 3), "date": point[1].isoformat()}
            continue
        assert definition.exercise_id is not None
        strength = await _strength_snapshot(
            session,
            participant.user_id,
            definition.exercise_id,
            start_date - timedelta(days=90),
            start_date,
        )
        if strength is None:
            missing.append(definition.label)
        else:
            baseline[definition.key] = strength
    if missing:
        raise CompetitionBaselineError(
            "Для старта обоим участникам нужны исходные данные: " + ", ".join(missing)
        )
    return baseline


async def participant_analytics(
    session: AsyncSession,
    competition: Competition,
    participant: CompetitionParticipant,
    definitions: list[FactorDefinition],
    *,
    as_of: date,
) -> ParticipantAnalytics:
    if competition.start_date is None or competition.end_date is None:
        return ParticipantAnalytics()
    effective_end = min(competition.end_date, as_of)
    baseline = participant.baseline if isinstance(participant.baseline, dict) else {}
    results: list[FactorResult] = []
    for definition in definitions:
        if definition.metric == "regularity":
            score = await regularity_score(session, competition, participant)
            results.append(FactorResult(
                definition=definition,
                status="ready" if score.score is not None else "no_progress",
                value=score.score,
                completed=score.completed,
                planned=score.planned,
                unit="%",
            ))
            continue
        stored = baseline.get(definition.key)
        if not isinstance(stored, dict) or not isinstance(stored.get("value") or stored.get("relative_e1rm"), (int, float)):
            results.append(FactorResult(definition, "baseline_missing"))
            continue
        if definition.metric in ("weight_loss", "waist_reduction"):
            field_name = "weight_kg" if definition.metric == "weight_loss" else "waist_cm"
            latest = await _latest_measurement(session, participant.user_id, field_name, effective_end)
            baseline_value = float(stored["value"])
            if latest is None:
                results.append(FactorResult(definition, "no_progress"))
                continue
            value, capped = improvement_percent(baseline_value, latest[0], decrease=True)
            results.append(FactorResult(
                definition=definition,
                status="ready",
                value=value,
                baseline_value=round(baseline_value, 2),
                latest_value=round(latest[0], 2),
                baseline_date=_safe_date(stored.get("date")),
                latest_date=latest[1],
                unit="кг" if definition.metric == "weight_loss" else "см",
                capped=capped,
            ))
            continue
        assert definition.exercise_id is not None
        current = await _strength_snapshot(
            session,
            participant.user_id,
            definition.exercise_id,
            competition.start_date,
            effective_end,
        )
        baseline_value = float(stored["relative_e1rm"])
        if current is None:
            results.append(FactorResult(
                definition=definition,
                status="no_progress",
                value=0.0,
                baseline_value=round(baseline_value, 3),
                latest_value=round(baseline_value, 3),
                baseline_date=_safe_date(stored.get("date")),
                latest_date=_safe_date(stored.get("date")),
                unit="× массы тела",
            ))
            continue
        latest_value = float(current["relative_e1rm"])
        value, capped = improvement_percent(baseline_value, latest_value)
        results.append(FactorResult(
            definition=definition,
            status="ready",
            value=value,
            baseline_value=round(baseline_value, 3),
            latest_value=round(latest_value, 3),
            baseline_date=_safe_date(stored.get("date")),
            latest_date=_safe_date(current.get("date")),
            unit="× массы тела",
            capped=capped,
        ))
    return ParticipantAnalytics(factors=results)


def assign_factor_wins(
    mine: ParticipantAnalytics,
    theirs: ParticipantAnalytics,
) -> Literal["me", "friend", "tie"] | None:
    my_by_key = {item.definition.key: item for item in mine.factors}
    their_by_key = {item.definition.key: item for item in theirs.factors}
    compared = 0
    for key, my_result in my_by_key.items():
        their_result = their_by_key.get(key)
        if my_result.value is None or their_result is None or their_result.value is None:
            continue
        compared += 1
        if my_result.value > their_result.value + 0.05:
            mine.wins += 1
        elif their_result.value > my_result.value + 0.05:
            theirs.wins += 1
    if not compared:
        return None
    if mine.wins > theirs.wins:
        return "me"
    if theirs.wins > mine.wins:
        return "friend"
    return "tie"
