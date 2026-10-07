"""Historical reports must select real completed data before describing it."""

from __future__ import annotations

import importlib
import importlib.util
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy.sql import operators

from app.models.daily_metric import DailyMetric
from app.models.exercise import Exercise
from app.models.workout import Workout, WorkoutSet

TODAY = date(2026, 10, 6)
OWNER = uuid.uuid4()


def reports():
    assert importlib.util.find_spec("app.ai.workout_reports") is not None, (
        "Missing deterministic historical workout reports"
    )
    return importlib.import_module("app.ai.workout_reports")


def user():
    return SimpleNamespace(id=OWNER, goals={})


def recorded_set(*, weight=None, reps=None, per_hand=False, seconds=None,
                 completed=True, deleted=False, exercise_id=None):
    return WorkoutSet(
        id=uuid.uuid4(), workout_id=uuid.uuid4(), exercise_id=exercise_id or uuid.uuid4(),
        set_number=1, weight=Decimal(str(weight)) if weight is not None else None,
        reps=reps, weight_mode="per_hand" if per_hand else "total",
        duration_sec=seconds, is_completed=completed, is_deleted=deleted,
    )


def workout(day, *, sets=(), status="completed", deleted=False, owner=OWNER,
            title="Фактическая тренировка", rpe=7, duration=3600, plan=None):
    row = Workout(
        id=uuid.uuid4(), user_id=owner, scheduled_date=day, status=status,
        is_deleted=deleted, title=title, rpe=rpe, duration_sec=duration, plan=plan or {},
        completed_at=datetime.combine(day, datetime.min.time(), tzinfo=UTC),
        created_at=datetime.combine(day, datetime.min.time(), tzinfo=UTC),
    )
    row.sets = list(sets)
    return row


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class QuerySession:
    """Evaluate emitted scalar SQL filters over fixtures; never return blind canned data."""

    def __init__(self, workouts=(), metrics=(), exercises=()):
        self.workouts = list(workouts)
        self.metrics = list(metrics)
        self.exercises = list(exercises)
        self.statements = []

    async def scalars(self, statement):
        self.statements.append(statement)
        entity = statement.column_descriptions[0]["entity"]
        rows = {Workout: self.workouts, DailyMetric: self.metrics, Exercise: self.exercises}[entity]
        criteria = statement._where_criteria
        if entity in {Workout, DailyMetric}:
            fields = {clause.left.name for clause in criteria}
            assert {"user_id", "is_deleted"} <= fields
            assert "scheduled_date" in fields if entity is Workout else "date" in fields
        if entity is Workout:
            assert any(clause.left.name == "status" and clause.right.value == "completed"
                       for clause in criteria)
            assert any(clause.left.name == "scheduled_date" and clause.operator is operators.le
                       for clause in criteria), "Future completions must be excluded"
        for clause in criteria:
            name = clause.left.name
            value = getattr(clause.right, "value", None)
            if str(clause.right) == "false":
                value = False
            op = clause.operator
            match = {
                operators.eq: lambda item: item == value,
                operators.ge: lambda item: item >= value,
                operators.le: lambda item: item <= value,
                operators.is_: lambda item: item is value,
                operators.in_op: lambda item: item in value,
            }[op]
            rows = [row for row in rows if match(getattr(row, name))]
        if entity is Workout:
            descending = "scheduled_date DESC" in str(statement)
            rows = sorted(rows, key=lambda row: (row.scheduled_date, row.completed_at),
                          reverse=descending)
        limit = statement._limit_clause
        return Rows(rows[:limit.value] if limit is not None else rows)


@pytest.mark.parametrize(("message", "expected"), [
    ("Проанализируй мою предыдущую тренировку", True),
    ("Разбери последнюю завершённую тренировку", True),
    ("Оцени прошлую тренировку", True),
    ("Проанализируй мой прогресс за месяц", False),
    ("Разбор недели: объём и восстановление", False),
])
def test_latest_intent_does_not_turn_periods_into_one_workout(message, expected):
    assert reports().latest_workout_requested(message) is expected


async def test_latest_workout_ignores_future_plans_and_14_day_cutoff():
    good = workout(date(2026, 8, 1), sets=[recorded_set(weight=50, reps=10)],
                   title="Прошлая выполненная")
    session = QuerySession([
        good, workout(TODAY, status="planned", title="Будущий план"),
        workout(date(2026, 10, 7), title="Будущее завершение"),
        workout(date(2026, 10, 5), deleted=True),
        workout(TODAY, owner=uuid.uuid4()),
    ])
    report = await reports().build_workout_report(
        session, user(), message="Проанализируй мою предыдущую тренировку", days=14, today=TODAY,
    )
    assert "2026-08-01" in report and "Прошлая выполненная" in report
    assert "500" in report and "Будущий" not in report
    query = session.statements[0]
    assert not any(clause.left.name == "scheduled_date" and clause.operator is operators.ge
                   for clause in query._where_criteria)
    assert query._limit_clause.value == 1
    assert "completed_at DESC NULLS LAST" in str(query)


async def test_latest_uses_actual_sets_names_and_separates_load_kinds():
    exercise_id = uuid.uuid4()
    real = workout(date(2026, 10, 5), sets=[
        recorded_set(weight=50, reps=10, exercise_id=exercise_id),
        recorded_set(weight=12.5, reps=8, per_hand=True, exercise_id=exercise_id),
        recorded_set(reps=15), recorded_set(seconds=60),
        recorded_set(weight=1000, reps=10, deleted=True),
        recorded_set(weight=1000, reps=10, completed=False),
    ])
    session = QuerySession([real], exercises=[Exercise(
        id=exercise_id, name_ru="Становая тяга", is_deleted=False,
    )])
    report = await reports().build_workout_report(
        session, user(), message="Разбери последнюю тренировку", days=14, today=TODAY,
    )
    assert "Становая тяга" in report and "50 кг × 10" in report
    assert "12,5 кг × 8" in report and "на гантель" in report
    assert "700 кг·повт" in report and "15 повтор" in report and "60 сек" in report
    assert "RPE: 7/10" in report and "60 мин" in report
    assert "сравните" in report.lower() and "перед повышением веса" in report.lower()
    assert "1000" not in report


async def test_period_uses_both_date_bounds_and_compares_mean_not_only_total():
    session = QuerySession([
        workout(date(2026, 9, 7), sets=[recorded_set(weight=10, reps=10)], rpe=6),
        workout(date(2026, 9, 12), sets=[recorded_set(weight=30, reps=10)], rpe=8),
        workout(date(2026, 10, 5), sets=[recorded_set(weight=60, reps=10)], rpe=7),
        workout(date(2026, 9, 6), sets=[recorded_set(weight=900, reps=10)]),
        workout(date(2026, 10, 7), sets=[recorded_set(weight=900, reps=10)]),
    ])
    report = await reports().build_workout_report(
        session, user(), message="Проанализируй мой прогресс за месяц", days=30, today=TODAY,
    )
    assert "2026-09-07" in report and "2026-10-06" in report
    assert "1000 кг·повт" in report and "RPE: 7" in report
    assert "200" in report and "600" in report
    assert "на тренировку" in report and "сил" in report
    assert "9000" not in report


async def test_actual_weights_keep_two_decimals_without_changing_load_math():
    session = QuerySession([workout(TODAY, sets=[
        recorded_set(weight=1.25, reps=10, per_hand=True),
    ])])
    report = await reports().build_workout_report(
        session, user(), message="Оцени последнюю тренировку", days=7, today=TODAY,
    )
    assert "1,25 кг × 10" in report
    assert "Тоннаж: 25 кг·повт" in report


async def test_recovery_missing_does_not_erase_workout_report():
    session = QuerySession([workout(TODAY, sets=[recorded_set(weight=50, reps=10)])])
    report = await reports().build_workout_report(
        session, user(), message="Разбор недели: объём и восстановление", days=7, today=TODAY,
    )
    assert "500 кг·повт" in report and "восстановлен" in report.lower()
    assert "нет записей" in report.lower()


async def test_empty_workouts_preserve_available_recovery():
    metric = DailyMetric(user_id=OWNER, date=TODAY, sleep_minutes=480,
                         is_deleted=False, steps=None, active_minutes=None)
    session = QuerySession(metrics=[metric])
    report = await reports().build_workout_report(
        session, user(), message="Разбор недели: объём и восстановление", days=7, today=TODAY,
    )
    assert "нет завершённых тренировок" in report.lower()
    assert "сон" in report and "8 ч" in report


async def test_local_schedule_date_is_used_without_server_date(monkeypatch):
    module = reports()
    monkeypatch.setattr(module, "local_schedule_day", lambda _goals: date(2026, 10, 5))
    session = QuerySession([workout(date(2026, 10, 6)), workout(date(2026, 10, 5))])
    report = await module.build_workout_report(
        session, user(), message="Проанализируй прогресс", days=7,
    )
    assert "2026-09-29" in report and "2026-10-05" in report
    assert "Тренировок: 1" in report


async def test_many_exercises_are_bounded_with_visible_truncation():
    sets = [recorded_set(weight=50, reps=10) for _ in range(40)]
    plan = {"exercises": [{"exercise_id": str(row.exercise_id),
                           "name_ru": "Очень длинное название упражнения " * 10} for row in sets]}
    session = QuerySession([workout(TODAY, sets=sets, plan=plan)])
    report = await reports().build_workout_report(
        session, user(), message="Оцени последнюю тренировку", days=7, today=TODAY,
    )
    assert len(report) <= 2000
    assert "показан" in report.lower() or "сокращ" in report.lower()


def test_combined_recovery_intent_keeps_workout_volume():
    assert reports().include_recovery_requested("Разбор недели: объём и восстановление")
    assert reports().include_recovery_requested("Разбери тренировки и сон за неделю")
    assert not reports().include_recovery_requested("Проанализируй прогресс за месяц")


async def evidence(session, *, message="Оцени последнюю тренировку", days=14):
    module = reports()
    assert hasattr(module, "build_workout_evidence"), "Missing evidence for genuine AI interpretation"
    return await module.build_workout_evidence(session, user(), message=message, days=days, today=TODAY)


async def test_evidence_preserves_report_and_bounds_citable_facts():
    sets = [recorded_set(weight=20, reps=10) for _ in range(40)]
    plan = {"exercises": [{"exercise_id": str(item.exercise_id),
                           "name_ru": "Длинное название " * 30} for item in sets]}
    session = QuerySession([workout(TODAY, sets=sets, plan=plan)])
    result = await evidence(session)
    assert isinstance(result, reports().WorkoutReportEvidence)
    assert result.has_data and len(result.report) <= 2000
    assert 2 <= len(result.facts) <= 12
    assert list(result.facts) == [f"F{index}" for index in range(1, len(result.facts) + 1)]
    assert sum(len(key) + len(value) for key, value in result.facts.items()) <= 2200
    report = await reports().build_workout_report(
        session, user(), message="Оцени последнюю тренировку", days=14, today=TODAY,
    )
    assert result.report == report


async def test_comparison_normalizes_per_hand_and_uses_exact_exercise_ids():
    exercise_id = uuid.uuid4()
    other_id = uuid.uuid4()
    session = QuerySession([
        workout(TODAY, sets=[recorded_set(weight=10, reps=8, per_hand=True, exercise_id=exercise_id)]),
        workout(date(2026, 10, 5), sets=[recorded_set(weight=100, reps=8, exercise_id=other_id)]),
        workout(date(2026, 9, 30), sets=[recorded_set(weight=20, reps=8, exercise_id=exercise_id)]),
    ], exercises=[Exercise(id=exercise_id, name_ru="Тяга гантелей", is_deleted=False)])
    result = await evidence(session)
    facts = "\n".join(result.facts.values())
    assert "2026-09-30" in facts and "2026-10-05" not in facts
    assert "максимальный суммарный вес одинаков" in facts.lower()
    assert "Тяга гантелей" in facts
    assert "сила выросла" not in facts.lower()


async def test_heavier_weight_with_fewer_reps_is_not_called_strength_gain():
    exercise_id = uuid.uuid4()
    session = QuerySession([
        workout(TODAY, sets=[recorded_set(weight=60, reps=5, exercise_id=exercise_id)]),
        workout(date(2026, 10, 1), sets=[
            recorded_set(weight=50, reps=10, exercise_id=exercise_id),
            recorded_set(weight=50, reps=10, exercise_id=exercise_id),
        ]),
    ])
    facts = "\n".join((await evidence(session)).facts.values()).lower()
    assert "вес выше" in facts and "повторов при этом весе меньше" in facts
    assert "набор числа повторов по подходам отличается" in facts
    assert "сила выросла" not in facts


async def test_comparison_excludes_deleted_unfinished_foreign_and_old_baselines():
    exercise_id = uuid.uuid4()
    def bad_set(**kwargs):
        return recorded_set(weight=100, reps=10, exercise_id=exercise_id, **kwargs)
    session = QuerySession([
        workout(TODAY, sets=[recorded_set(weight=50, reps=10, exercise_id=exercise_id)]),
        workout(date(2026, 10, 5), sets=[bad_set(deleted=True)]),
        workout(date(2026, 10, 4), sets=[bad_set(completed=False)]),
        workout(date(2026, 10, 3), sets=[bad_set()], owner=uuid.uuid4()),
        workout(date(2026, 10, 2), sets=[bad_set()], deleted=True),
        workout(date(2026, 6, 1), sets=[bad_set()]),
    ])
    facts = "\n".join((await evidence(session)).facts.values()).lower()
    assert "нет сопоставимой" in facts and "90 дней" in facts
    assert "вес ниже" not in facts


async def test_intra_workout_stability_is_derived_from_recorded_sets():
    exercise_id = uuid.uuid4()
    first = recorded_set(weight=50, reps=10, exercise_id=exercise_id)
    second = recorded_set(weight=50, reps=8, exercise_id=exercise_id)
    second.set_number = 2
    result = await evidence(QuerySession([workout(TODAY, sets=[first, second])]))
    facts = "\n".join(result.facts.values()).lower()
    assert "вес одинаковый" in facts and "повторы к последнему подходу снизились" in facts
    assert "в последнем занятии" in facts
    assert "техника ухудшилась" not in facts


async def test_period_evidence_keeps_count_difference_and_per_workout_volume():
    rows = [
        workout(date(2026, 9, 7), sets=[recorded_set(weight=10, reps=10)]),
        workout(date(2026, 9, 12), sets=[recorded_set(weight=30, reps=10)]),
        workout(date(2026, 10, 5), sets=[recorded_set(weight=60, reps=10)]),
    ]
    result = await evidence(QuerySession(rows), message="Проанализируй прогресс за месяц", days=30)
    facts = "\n".join(result.facts.values()).lower()
    assert "200" not in facts and "600" not in facts
    assert "число тренировок уменьшилось" in facts
    assert "средний тоннаж на тренировку выше" in facts
    assert "не подтверждает рост силы" in facts
    assert "без веса: 0" not in facts and "по времени: 0" not in facts
    assert "1000 кг·повт" in result.report


async def test_latest_facts_prioritize_exercise_changes_before_summary():
    exercise_id = uuid.uuid4()
    session = QuerySession([
        workout(TODAY, sets=[recorded_set(weight=60, reps=8, exercise_id=exercise_id)]),
        workout(date(2026, 10, 1), sets=[recorded_set(weight=50, reps=8, exercise_id=exercise_id)]),
    ], exercises=[Exercise(id=exercise_id, name_ru="Становая тяга", is_deleted=False)])
    result = await evidence(session)
    first = next(iter(result.facts.values()))
    assert "Становая тяга" in first and "вес выше" in first
    assert "Относительно предыдущей записи 2026-10-01" in first
    assert "набор числа повторов по подходам одинаковый" in first
    assert "RPE" not in " ".join(result.facts.values())
    assert "RPE: 7/10" in result.report
    assert "600 кг·повт" not in result.report and "480 кг·повт" in result.report


async def test_weekly_recovery_is_one_fact_with_all_available_metrics():
    metric = DailyMetric(user_id=OWNER, date=TODAY, sleep_minutes=480,
                         is_deleted=False, steps=9000, active_minutes=20)
    session = QuerySession([
        workout(date(2026, 10, 1), sets=[recorded_set(weight=10, reps=10)]),
        workout(date(2026, 10, 5), sets=[recorded_set(weight=60, reps=10)]),
    ], metrics=[metric])
    profile = user()
    profile.goals = {"water_log": {"2026-10-06": 1200}}
    result = await reports().build_workout_evidence(
        session, profile, message="Разбор недели: объём и восстановление", days=7, today=TODAY,
    )
    recovery = [value for value in result.facts.values()
                if all(word in value for word in ("сон", "шаги", "активность", "вода"))]
    assert len(recovery) == 1
    assert all(value in recovery[0] for value in ("8 ч", "9000", "20 мин", "1200 мл"))
    assert len(result.facts) <= 12 and sum(len(v) + len(k) for k, v in result.facts.items()) <= 2200
    assert all(value in result.report for value in ("8 ч", "9000", "20 мин", "1200 мл"))


async def test_recovery_only_can_supply_evidence_without_inventing_workouts():
    metric = DailyMetric(user_id=OWNER, date=TODAY, sleep_minutes=480,
                         is_deleted=False, steps=None, active_minutes=None)
    result = await evidence(QuerySession(metrics=[metric]),
                            message="Разбор недели: объём и восстановление", days=7)
    assert result.has_data
    facts = "\n".join(result.facts.values()).lower()
    assert "нет завершённых тренировок" in facts and "сон" in facts and "8 ч" in facts


async def test_empty_evidence_does_not_claim_data_available():
    result = await evidence(QuerySession(), message="Проанализируй прогресс за месяц", days=30)
    assert not result.has_data
    assert "нет завершённых тренировок" in result.report.lower()


async def test_single_weekly_workout_has_known_volume_without_half_period_trend():
    result = await evidence(
        QuerySession([workout(TODAY, sets=[recorded_set(weight=50, reps=10)])]),
        message="Разбор недели: объём и восстановление", days=7,
    )
    facts = "\n".join(result.facts.values()).lower()
    assert "тренировок: 1" in facts and "500 кг·повт" not in facts
    assert "500 кг·повт" in result.report
    assert "объём самого занятия рассчитан" in facts
    assert "изменения между занятиями не сравнивались" in facts
    assert "половин" not in facts
    assert "объём оценить нельзя" not in facts


async def test_month_model_evidence_keeps_mean_direction_while_report_has_overall_volume():
    rows = [
        workout(date(2026, 9, 7), sets=[recorded_set(weight=10, reps=10)]),
        workout(date(2026, 9, 12), sets=[recorded_set(weight=30, reps=10)]),
        workout(TODAY, sets=[recorded_set(weight=60, reps=10)]),
    ]
    result = await evidence(QuerySession(rows), message="Прогресс за месяц", days=30)
    facts = "\n".join(result.facts.values()).lower()
    assert "1000 кг·повт" not in facts and "1000 кг·повт" in result.report
    assert "тренировок: 3" in facts
    assert "средний тоннаж на тренировку выше" in facts
    assert "200" not in facts and "600" not in facts
    assert sum(len(k) + len(v) for k, v in result.facts.items()) <= 1200


async def test_latest_evidence_is_partial_and_prefers_one_constant_weight_pattern():
    ids = [uuid.uuid4() for _ in range(3)]
    current_sets, previous_sets = [], []
    for index, exercise_id in enumerate(ids):
        first = recorded_set(weight=20, reps=10, exercise_id=exercise_id)
        last = recorded_set(weight=30 if index == 0 else 20, reps=10, exercise_id=exercise_id)
        last.set_number = 2
        current_sets.extend([first, last])
        previous_sets.append(recorded_set(weight=15, reps=10, exercise_id=exercise_id))
    session = QuerySession([
        workout(TODAY, sets=current_sets),
        workout(date(2026, 10, 1), sets=previous_sets),
    ], exercises=[Exercise(id=item, name_ru=f"Упражнение {index}", is_deleted=False)
                  for index, item in enumerate(ids)])
    result = await evidence(session)
    values = list(result.facts.values())
    assert sum(value.startswith("Относительно предыдущей записи") for value in values) == 2
    patterns = [value for value in values if value.startswith("В последнем занятии")]
    assert len(patterns) == 1 and "вес одинаковый" in patterns[0]
    assert "повторы к последнему подходу не изменились" in patterns[0]
    facts = "\n".join(values).lower()
    assert "выборка сравнений частичная" in facts
    assert "техника по записям не оценена" in facts
    assert sum(len(k) + len(v) for k, v in result.facts.items()) <= 1200


async def test_less_weight_more_reps_describes_regime_change_without_strength_or_endurance_gain():
    exercise_id = uuid.uuid4()
    session = QuerySession([
        workout(TODAY, sets=[recorded_set(weight=40, reps=12, exercise_id=exercise_id)]),
        workout(date(2026, 10, 1), sets=[recorded_set(weight=50, reps=8, exercise_id=exercise_id)]),
    ])
    facts = "\n".join((await evidence(session)).facts.values()).lower()
    assert "вес ниже" in facts and "повторов при этом весе больше" in facts
    assert "режим нагрузки изменился" in facts
    assert "не подтверждает улучшение силы или выносливости" in facts


async def test_larger_session_mean_with_different_counts_has_explicit_inference_limit():
    rows = [
        workout(date(2026, 9, 7), sets=[recorded_set(weight=10, reps=10)]),
        workout(date(2026, 9, 12), sets=[recorded_set(weight=30, reps=10)]),
        workout(TODAY, sets=[recorded_set(weight=60, reps=10)]),
    ]
    result = await evidence(QuerySession(rows), message="Прогресс за месяц", days=30)
    facts = "\n".join(result.facts.values()).lower()
    assert "средний объём занятия больше" in facts
    assert "не подтверждает рост силы, частоты или общей суммы тоннажа" in facts
    assert "1000 кг·повт" in result.report and "1000" not in facts


async def test_partial_recovery_coverage_is_incomplete_not_a_quality_rating():
    metric = DailyMetric(user_id=OWNER, date=TODAY, sleep_minutes=480,
                         is_deleted=False, steps=9000, active_minutes=20)
    result = await evidence(QuerySession(metrics=[metric]),
                            message="Разбор недели: объём и восстановление", days=7)
    facts = "\n".join(result.facts.values()).lower()
    assert "оценка неполная" in facts
    assert "средние сами по себе не доказывают низкое или несбалансированное восстановление" in facts
    assert "сон: в среднем 8 ч" in facts


async def test_full_recovery_coverage_does_not_claim_missing_days():
    metrics = [DailyMetric(user_id=OWNER, date=date(2026, 10, day), sleep_minutes=480,
                           is_deleted=False, steps=9000, active_minutes=20)
               for day in range(1, 7)]
    metrics.append(DailyMetric(user_id=OWNER, date=date(2026, 9, 30), sleep_minutes=480,
                              is_deleted=False, steps=9000, active_minutes=20))
    profile = user()
    profile.goals = {"water_log": {str(row.date): 1200 for row in metrics}}
    result = await reports().build_workout_evidence(
        QuerySession(metrics=metrics), profile,
        message="Разбор недели: объём и восстановление", days=7, today=TODAY,
    )
    facts = "\n".join(result.facts.values()).lower()
    assert "оценка неполная" not in facts and "заполнено 7 из 7" in facts
    assert sum(len(k) + len(v) for k, v in result.facts.items()) <= 2200


@pytest.mark.parametrize(("message", "days"), [
    ("Оцени последнюю тренировку", 14),
    ("Прогресс за месяц", 30),
    ("Разбор недели: объём и восстановление", 7),
])
async def test_model_facts_omit_absolute_volume_rpe_and_duration_but_report_keeps_them(message, days):
    result = await evidence(
        QuerySession([workout(TODAY, sets=[recorded_set(weight=50, reps=10)])]),
        message=message, days=days,
    )
    facts = "\n".join(result.facts.values()).lower()
    assert "500" not in facts and "rpe" not in facts and "длительность" not in facts
    assert "500 кг·повт" in result.report and "RPE: 7" in result.report
    if "последнюю" in message:
        assert "2026-10-06" in facts and "подходов выполнено: 1" in facts
        assert "60 мин" in result.report
