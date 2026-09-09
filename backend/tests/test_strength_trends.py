"""Explainable strength-trend set regressions."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql

from app.core.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models.exercise import Exercise
from app.services import strength_trends


class MappingRows:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class ScalarRows:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def all(self):
        return self.rows


def point(day: int, value: str) -> dict[str, object]:
    return {"date": date(2026, 8, day), "estimated_1rm": Decimal(value)}


def test_change_percent_uses_period_halves_and_needs_three_points() -> None:
    assert strength_trends._change_percent([point(1, "100"), point(8, "105")]) is None
    assert strength_trends._change_percent([
        point(1, "100"),
        point(8, "110"),
        point(15, "120"),
        point(22, "130"),
    ]) == Decimal("19.0")
    assert strength_trends._change_percent([
        point(1, "100"),
        point(8, "150"),
        point(15, "90"),
    ]) is None


@pytest.mark.asyncio
async def test_history_query_is_user_scoped_bounded_and_normalizes_per_hand() -> None:
    exercise_id = uuid.uuid4()
    session = SimpleNamespace(
        execute=AsyncMock(
            return_value=MappingRows([
                {
                    "exercise_id": exercise_id,
                    "date": date(2026, 9, 8),
                    "weight": Decimal("20"),
                    "total_weight": Decimal("40"),
                    "reps": 10,
                    "weight_mode": "per_hand",
                    "rank": 1,
                }
            ])
        )
    )
    user_id = uuid.uuid4()

    result = await strength_trends._history_by_exercise(
        session,
        user_id=user_id,
        period_start=date(2026, 7, 15),
        period_end=date(2026, 9, 8),
    )

    statement = session.execute.await_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "workouts.user_id" in sql
    assert "workouts.status" in sql
    assert "workout_sets.is_completed" in sql
    assert "LIMIT" in sql
    assert result[exercise_id][0]["total_weight"] == Decimal("40")
    assert result[exercise_id][0]["estimated_1rm"] == Decimal("53.3")


@pytest.mark.asyncio
async def test_strength_sets_keep_plan_order_rank_percent_growth_and_include_empty_pin(
    monkeypatch,
) -> None:
    ids = [uuid.uuid4() for _ in range(4)]
    exercises = [
        Exercise(id=value, name_ru=f"Упражнение {index}", muscle_group="грудь", difficulty=2)
        for index, value in enumerate(ids, start=1)
    ]
    histories = {
        ids[0]: [point(1, "100"), point(8, "110"), point(15, "120")],
        ids[1]: [point(1, "100"), point(8, "102"), point(15, "103")],
        ids[2]: [point(1, "100"), point(8, "90"), point(15, "80")],
    }

    async def fake_history(*_args, **_kwargs):
        return histories

    async def fake_next(*_args, **_kwargs):
        return {"date": date(2026, 9, 10), "title": "Тренировка A"}, [ids[1], ids[0]]

    monkeypatch.setattr(strength_trends, "_history_by_exercise", fake_history)
    monkeypatch.setattr(strength_trends, "_next_workout", fake_next)
    session = SimpleNamespace(
        scalars=AsyncMock(side_effect=[ScalarRows([ids[0], ids[3]]), ScalarRows(exercises)])
    )
    user = SimpleNamespace(id=uuid.uuid4(), goals={})

    result = await strength_trends.get_strength_trend_sets(session, user=user)

    assert [item["exercise_id"] for item in result["next_workout"]["items"]] == [ids[1], ids[0]]
    assert [item["exercise_id"] for item in result["best_improvements"]] == [ids[0], ids[1]]
    assert [item["exercise_id"] for item in result["pinned"]] == [ids[0], ids[3]]
    assert result["pinned"][1]["points"] == []
    assert result["period_days"] == 56


@pytest.mark.asyncio
async def test_strength_trends_route_precedes_uuid_route_and_requires_plus(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    db_session = SimpleNamespace(scalar=AsyncMock(return_value=uuid.uuid4()))

    async def fake_db():
        yield db_session

    async def fake_sets(_session, **_kwargs):
        return {
            "period_start": date(2026, 7, 16),
            "period_end": date(2026, 9, 9),
            "period_days": 56,
            "next_workout": None,
            "best_improvements": [],
            "pinned": [],
        }

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(strength_trends, "get_strength_trend_sets", fake_sets)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/exercises/strength-trends")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["period_days"] == 56
