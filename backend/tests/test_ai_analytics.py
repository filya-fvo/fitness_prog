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
        ("Что есть после тренировки?", AIQueryDomain.GENERAL),
        ("Разбор недели: объём и восстановление", AIQueryDomain.WORKOUT_PROGRESS),
        ("Тренировки", AIQueryDomain.WORKOUT_PROGRESS),
        ("Проанализируй мою предыдущую тренировку", AIQueryDomain.WORKOUT_PROGRESS),
        ("Разбери последнюю завершённую тренировку", AIQueryDomain.WORKOUT_PROGRESS),
        ("Оцени предыдущую тренировку", AIQueryDomain.WORKOUT_PROGRESS),
        ("Оцени прошлую тренировку", AIQueryDomain.WORKOUT_PROGRESS),
        ("Как прошла последняя тренировка?", AIQueryDomain.WORKOUT_PROGRESS),
        ("Как тренироваться во время менструального цикла?", AIQueryDomain.GENERAL),
        ("Что делать, если болит плечо?", AIQueryDomain.SAFETY),
        ("Как настроиться на тренировку?", AIQueryDomain.GENERAL),
        ("Привет, как дела?", AIQueryDomain.GENERAL),
    ],
)
def test_ai_query_routes_to_expected_domain(
    message: str,
    expected: AIQueryDomain,
) -> None:
    assert classify_ai_query(message) == expected


@pytest.mark.parametrize(
    "message",
    [
        "Как выполнять приседания более безопасно?",
        "Как сделать больше повторений?",
        "Что такое более сложная прогрессия нагрузки?",
        "Как правильно делать жим лёжа?",
        "Как мне заменить тягу гантели?",
        "Какие упражнения подходят для груди и бицепса?",
        "Сколько белка нужно после тренировки?",
        "Как похудеть без жёсткой диеты?",
        "Сколько воды пить в день?",
        "Как улучшить сон и восстановление?",
        "Что такое тренировочный объём?",
        "Что такое прогресс в тренировках?",
        "Как работает анализ питания?",
        "Сравни приседания и становую тягу",
        "Оцени технику жима лёжа",
        "Какой средний вес гантелей подходит новичкам?",
        "Какой средний объём тренировки рекомендуется?",
        "Сколько я должен пить воды сегодня?",
        "Как улучшить мой сон сегодня?",
        "Чем отличаются средний вес и рабочий вес?",
        "Как подготовиться к последней тренировке программы?",
        "Что есть перед последней тренировкой программы?",
    ],
)
def test_general_coaching_does_not_require_diary_history(message: str) -> None:
    assert classify_ai_query(message) == AIQueryDomain.GENERAL


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Сравни мой жим за последние две недели", AIQueryDomain.STRENGTH),
        ("Почему мой вес не изменился за месяц?", AIQueryDomain.WEIGHT),
        ("Сколько белка я съел вчера?", AIQueryDomain.NUTRITION),
        ("Проверь записи сна за неделю", AIQueryDomain.RECOVERY),
        ("Покажи динамику моих замеров", AIQueryDomain.MEASUREMENTS),
        ("Оцени мои тренировки", AIQueryDomain.WORKOUT_PROGRESS),
        ("Какой у меня средний вес?", AIQueryDomain.WEIGHT),
        ("Какой средний вес у меня?", AIQueryDomain.WEIGHT),
        ("Сколько я выпил воды сегодня?", AIQueryDomain.RECOVERY),
        ("Сколько воды я выпила сегодня?", AIQueryDomain.RECOVERY),
        ("Сколько я прошёл шагов сегодня?", AIQueryDomain.RECOVERY),
        ("Какой мой средний сон?", AIQueryDomain.RECOVERY),
        ("Какая суммарная калорийность моего питания?", AIQueryDomain.NUTRITION),
        ("Чем отличается мой рацион на этой неделе от прошлой?", AIQueryDomain.NUTRITION),
        ("Чем отличаются мои тренировки за неделю?", AIQueryDomain.WORKOUT_PROGRESS),
    ],
)
def test_personal_history_keeps_the_requested_domain(
    message: str, expected: AIQueryDomain,
) -> None:
    assert classify_ai_query(message) == expected


@pytest.mark.parametrize(
    "message",
    [
        "Боль в колене после приседаний",
        "Боли в пояснице",
        "Можно тренироваться при болях в колене?",
        "Может ли болеть спина после тяги?",
        "Болят плечи после жима",
        "Болело плечо, как тренироваться?",
        "Что делать при травме?",
    ],
)
def test_actual_pain_and_injury_keep_safety_priority(message: str) -> None:
    assert classify_ai_query(message) == AIQueryDomain.SAFETY


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Питание", AIQueryDomain.NUTRITION),
        ("Сон", AIQueryDomain.RECOVERY),
        ("Жим лёжа", AIQueryDomain.STRENGTH),
        ("Вес", AIQueryDomain.WEIGHT),
        ("Замеры", AIQueryDomain.MEASUREMENTS),
    ],
)
def test_explicit_analysis_keeps_domain_without_history_wording(
    message: str, expected: AIQueryDomain,
) -> None:
    assert classify_ai_query(message, require_history=False) == expected


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
