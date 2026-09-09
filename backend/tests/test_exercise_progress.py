"""Bounded exercise progress aggregation and API contract regressions."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.core.database import get_db
from app.deps import get_current_user
from app.main import app
from app.services import exercise_progress


class MappingRows:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class CaptureSession:
    def __init__(self, result_sets: list[list[dict[str, object]]]) -> None:
        self.result_sets = result_sets
        self.statements: list[object] = []

    async def execute(self, statement):
        self.statements.append(statement)
        return MappingRows(self.result_sets.pop(0))


@pytest.mark.asyncio
async def test_progress_is_user_scoped_date_bounded_and_normalizes_per_hand() -> None:
    user_id = uuid.uuid4()
    exercise_id = uuid.uuid4()
    workout_id = uuid.uuid4()
    session = CaptureSession(
        [
            [{
                "date": date(2026, 9, 8),
                "weight": Decimal("22"),
                "total_weight": Decimal("44"),
                "reps": 8,
                "weight_mode": "per_hand",
                "phase": "heavy",
                "rank": 1,
            }],
            [
                {
                    "workout_id": workout_id,
                    "date": date(2026, 9, 8),
                    "phase": "heavy",
                },
                {
                    "workout_id": uuid.uuid4(),
                    "date": date(2026, 9, 1),
                    "phase": "medium",
                },
            ],
            [{
                "workout_id": workout_id,
                "set_number": 1,
                "weight": Decimal("22"),
                "total_weight": Decimal("44"),
                "reps": 8,
                "weight_mode": "per_hand",
            }],
        ]
    )

    result = await exercise_progress.get_exercise_progress(  # type: ignore[arg-type]
        session,
        user_id=user_id,
        exercise_id=exercise_id,
        date_from=date(2025, 9, 9),
        date_to=date(2026, 9, 8),
    )

    assert len(session.statements) == 3
    sql = str(session.statements[0].compile(dialect=postgresql.dialect()))
    assert "row_number() OVER (PARTITION BY workouts.scheduled_date" in sql
    assert "workouts.user_id" in sql
    assert "workouts.scheduled_date >=" in sql
    assert "workouts.scheduled_date <=" in sql
    assert "LIMIT" in sql
    assert result["points"] == [{
        "date": date(2026, 9, 8),
        "weight": Decimal("22"),
        "total_weight": Decimal("44"),
        "reps": 8,
        "estimated_1rm": Decimal("55.7"),
        "weight_mode": "per_hand",
        "phase": "heavy",
    }]
    assert result["summary"] == {
        "total_weight": {"latest": Decimal("44"), "best": Decimal("44"), "change": Decimal("0.0")},
        "estimated_1rm": {"latest": Decimal("55.7"), "best": Decimal("55.7"), "change": Decimal("0.0")},
    }
    assert result["diary"][0]["sets"][0]["total_weight"] == Decimal("44")
    assert exercise_progress.decode_diary_cursor(result["next_diary_cursor"]) == (
        date(2026, 9, 8),
        workout_id,
    )


def test_diary_cursor_is_opaque_and_rejects_invalid_values() -> None:
    workout_id = uuid.uuid4()
    cursor = exercise_progress.encode_diary_cursor(date(2026, 9, 8), workout_id)

    assert "2026-09-08" not in cursor
    assert exercise_progress.decode_diary_cursor(cursor) == (date(2026, 9, 8), workout_id)
    with pytest.raises(HTTPException) as exc_info:
        exercise_progress.decode_diary_cursor("not-a-cursor")
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_progress_route_returns_bounded_contract_for_plus(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    exercise_id = uuid.uuid4()
    captured: dict[str, object] = {}
    db_session = SimpleNamespace(scalar=AsyncMock(return_value=uuid.uuid4()))

    async def fake_db():
        yield db_session

    async def fake_progress(_session, **kwargs):
        captured.update(kwargs)
        return {
            "exercise_id": exercise_id,
            "period_start": date(2025, 9, 9),
            "period_end": date(2026, 9, 8),
            "points": [],
            "summary": {
                "total_weight": {"latest": None, "best": None, "change": None},
                "estimated_1rm": {"latest": None, "best": None, "change": None},
            },
            "diary": [],
            "next_diary_cursor": None,
        }

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(exercise_progress, "get_exercise_progress", fake_progress)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/workouts/exercises/{exercise_id}/progress")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["points"] == []
    assert captured["exercise_id"] == exercise_id
    assert captured["diary_limit"] == 1
