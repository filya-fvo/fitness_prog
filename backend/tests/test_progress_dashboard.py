"""Personal dashboard aggregate and API regressions."""

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
from app.services import progress_dashboard


def test_summary_counts_points_and_weights_rpe() -> None:
    workouts = [
        {"date": date(2026, 9, 1), "completed_workouts": 2, "rpe_sum": 15, "rpe_workouts": 2},
        {"date": date(2026, 9, 8), "completed_workouts": 1, "rpe_sum": 8, "rpe_workouts": 1},
    ]
    sets = [
        {"date": date(2026, 9, 1), "completed_sets": 6, "volume_kg": Decimal("1550.25")},
        {"date": date(2026, 9, 8), "completed_sets": 3, "volume_kg": Decimal("900")},
    ]
    planned = [
        {"date": date(2026, 9, 1), "planned_sets": 8},
        {"date": date(2026, 9, 8), "planned_sets": 4},
    ]

    result = progress_dashboard._summary(
        workouts,
        sets,
        planned,
        start=date(2026, 9, 1),
        end=date(2026, 9, 30),
    )

    assert result == {
        "completed_workouts": 3,
        "active_days": 2,
        "completed_sets": 9,
        "planned_sets": 12,
        "volume_kg": Decimal("2450.3"),
        "average_rpe": Decimal("7.7"),
        "rpe_workouts": 3,
    }


def test_weekly_rows_include_empty_weeks_and_keep_partial_period() -> None:
    rows = [{"date": date(2026, 9, 9), "completed_workouts": 1, "rpe_sum": 7, "rpe_workouts": 1}]
    sets = [{"date": date(2026, 9, 9), "completed_sets": 4, "volume_kg": 1200}]
    planned = [{"date": date(2026, 9, 9), "planned_sets": 5}]

    result = progress_dashboard._weekly_rows(
        rows,
        sets,
        planned,
        start=date(2026, 9, 2),
        end=date(2026, 9, 16),
    )

    assert len(result) == 3
    assert result[0]["completed_workouts"] == 0
    assert result[1]["completed_sets"] == 4
    assert result[1]["planned_sets"] == 5
    assert result[2]["volume_kg"] == Decimal("0.0")


def test_dashboard_queries_are_user_scoped_bounded_and_ignore_unfinished_sets() -> None:
    user_id = uuid.uuid4()
    kwargs = {"user_id": user_id, "start": date(2026, 6, 1), "end": date(2026, 9, 1)}
    dialect = postgresql.dialect()
    workout_sql = str(progress_dashboard._daily_workout_statement(**kwargs).compile(dialect=dialect))
    set_sql = str(progress_dashboard._daily_set_statement(**kwargs).compile(dialect=dialect))
    muscle_sql = str(progress_dashboard._muscle_group_statement(**kwargs).compile(dialect=dialect))
    planned_sql = str(progress_dashboard._daily_planned_set_statement(**kwargs).compile(dialect=dialect))

    for sql in (workout_sql, set_sql, muscle_sql, planned_sql):
        assert "workouts.user_id" in sql
        assert "workouts.scheduled_date >=" in sql
        assert "workouts.scheduled_date <=" in sql
        assert "workouts.status" in sql
    assert "workout_sets.is_completed" in set_sql
    assert "workout_sets.is_completed" in muscle_sql
    assert "LIMIT" in muscle_sql
    assert "jsonb_array_elements" in planned_sql


@pytest.mark.asyncio
async def test_dashboard_route_requires_plus_and_returns_bounded_contract(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    session = SimpleNamespace(scalar=AsyncMock(return_value=uuid.uuid4()))

    async def fake_db():
        yield session

    async def fake_dashboard(*_args, **_kwargs):
        return {
            "period_start": date(2026, 8, 17),
            "period_end": date(2026, 9, 13),
            "period_days": 28,
            "previous_period_start": date(2026, 7, 20),
            "previous_period_end": date(2026, 8, 16),
            "current": {"completed_workouts": 4, "active_days": 4, "completed_sets": 20, "planned_sets": 24, "volume_kg": 4200, "average_rpe": 7.5, "rpe_workouts": 2},
            "previous": {"completed_workouts": 3, "active_days": 3, "completed_sets": 16, "planned_sets": 18, "volume_kg": 3500, "average_rpe": None, "rpe_workouts": 0},
            "weeks": [],
            "muscle_groups": [],
            "lifetime_completed_workouts": 25,
            "lifetime_completed_sets": 180,
        }

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(progress_dashboard, "get_progress_dashboard", fake_dashboard)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/workouts/dashboard?period_days=28")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["current"]["completed_workouts"] == 4
    assert response.json()["lifetime_completed_workouts"] == 25
