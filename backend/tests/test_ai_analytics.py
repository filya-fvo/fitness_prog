"""Domain routing, period parsing and canonical workout-load tests."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.ai.analytics import (
    AIQueryDomain,
    classify_ai_query,
    extract_period_days,
    missing_data_question,
)
from app.models.workout import WorkoutSet
from app.services.workout_metrics import aggregate_workout_load, normalized_set_volume


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Как идёт прогресс в жиме?", AIQueryDomain.STRENGTH),
        ("Проанализируй мой прогресс за месяц", AIQueryDomain.WORKOUT_PROGRESS),
        ("Проанализируй снижение веса", AIQueryDomain.WEIGHT),
        ("Как изменилась талия?", AIQueryDomain.MEASUREMENTS),
        ("Как было питание за неделю?", AIQueryDomain.NUTRITION),
        ("Что есть после тренировки?", AIQueryDomain.NUTRITION),
        ("Разбор недели: объём и восстановление", AIQueryDomain.RECOVERY),
        ("Как тренироваться во время менструального цикла?", AIQueryDomain.RECOVERY),
        ("Что делать, если болит плечо?", AIQueryDomain.SAFETY),
        ("Как настроиться на тренировку?", AIQueryDomain.WORKOUT_PROGRESS),
        ("Привет, как дела?", AIQueryDomain.GENERAL),
    ],
)
def test_ai_query_routes_to_expected_domain(
    message: str,
    expected: AIQueryDomain,
) -> None:
    assert classify_ai_query(message) == expected


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("за неделю", 7),
        ("за две недели", 14),
        ("за месяц", 30),
        ("за 3 месяца", 90),
        ("за полугодие", 180),
        ("за год", 365),
        ("за последние 45 дней", 45),
        ("без периода", 14),
    ],
)
def test_period_is_extracted_without_silent_14_day_fallback(
    message: str,
    expected: int,
) -> None:
    assert extract_period_days(message) == expected


def workout_set(
    *,
    reps: int | None = None,
    weight: str | None = None,
    weight_mode: str | None = None,
    duration_sec: int | None = None,
    completed: bool = True,
) -> WorkoutSet:
    return WorkoutSet(
        workout_id=uuid.uuid4(),
        exercise_id=uuid.uuid4(),
        set_number=1,
        reps=reps,
        weight=Decimal(weight) if weight else None,
        weight_mode=weight_mode,
        duration_sec=duration_sec,
        is_completed=completed,
    )


def test_canonical_load_separates_weight_reps_and_time() -> None:
    total = workout_set(reps=10, weight="50", weight_mode="total")
    per_hand = workout_set(reps=8, weight="12.5", weight_mode="per_hand")
    reps_only = workout_set(reps=15)
    timed = workout_set(duration_sec=60)
    skipped = workout_set(reps=10, weight="100", completed=False)

    assert normalized_set_volume(total) == 500
    assert normalized_set_volume(per_hand) == 200
    metrics = aggregate_workout_load([total, per_hand, reps_only, timed, skipped])
    assert metrics.weighted_volume_kg_reps == 700
    assert metrics.weighted_sets == 2
    assert metrics.reps_only_reps == 15
    assert metrics.reps_only_sets == 1
    assert metrics.timed_seconds == 60
    assert metrics.timed_sets == 1


def test_missing_evidence_returns_exactly_one_question() -> None:
    reply = missing_data_question(AIQueryDomain.WEIGHT, 30)
    assert reply.count("?") == 1
    assert "30" not in reply or "период" in reply
