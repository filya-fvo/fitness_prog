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
