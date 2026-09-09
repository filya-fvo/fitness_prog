"""Bounded FREE load-hint contract and aggregate query regressions."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.main import app
from app.core.database import get_db
from app.deps import get_current_user
from app.schemas.workout import WorkoutLoadHintsRequest
from app.services import workout_load_hints


class MappingRows:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self):
        return self.rows


class CaptureSession:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return MappingRows(self.rows)


def test_load_hint_request_is_nonempty_and_bounded() -> None:
    with pytest.raises(ValidationError):
        WorkoutLoadHintsRequest(exercise_ids=[])
    with pytest.raises(ValidationError):
        WorkoutLoadHintsRequest(exercise_ids=[uuid.uuid4() for _ in range(101)])
    assert set(app.openapi()["paths"]["/workouts/load-hints"]) == {"post"}


@pytest.mark.asyncio
async def test_load_hints_use_one_aggregate_user_scoped_query() -> None:
    user_id = uuid.uuid4()
    exercise_id = uuid.uuid4()
    session = CaptureSession([{
        "exercise_id": exercise_id,
        "weight": Decimal("72.50"),
        "reps": 8,
        "duration_sec": None,
        "weight_mode": "total",
        "machine_params": None,
        "rpe": 8,
        "completed_date": date(2026, 9, 7),
        "phase": "heavy",
        "rank": 1,
    }])

    result = await workout_load_hints.load_hints_for_exercises(  # type: ignore[arg-type]
        session,
        user_id=user_id,
        exercise_ids=[exercise_id, exercise_id],
    )

    assert len(session.statements) == 1
    sql = str(session.statements[0].compile(dialect=postgresql.dialect()))
    assert "row_number() OVER (PARTITION BY workout_sets.exercise_id" in sql
    assert "workouts.user_id" in sql
    assert "workout_sets.is_completed IS true" in sql
    assert "workouts.status" in sql
    assert result == [{
        "exercise_id": exercise_id,
        "weight": Decimal("72.50"),
        "reps": 8,
        "duration_sec": None,
        "weight_mode": "total",
        "machine_params": None,
        "rpe": 8,
        "completed_date": date(2026, 9, 7),
        "phase_loads": {
            "heavy": {
                "weight": Decimal("72.50"),
                "reps": 8,
                "duration_sec": None,
                "weight_mode": "total",
                "machine_params": None,
                "rpe": 8,
                "completed_date": date(2026, 9, 7),
            }
        },
    }]


@pytest.mark.asyncio
async def test_load_hints_route_passes_only_authenticated_user(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4())
    exercise_id = uuid.uuid4()
    captured: dict[str, object] = {}

    async def fake_db():
        yield SimpleNamespace()

    async def fake_hints(_session, *, user_id, exercise_ids):
        captured.update(user_id=user_id, exercise_ids=exercise_ids)
        return [{
            "exercise_id": exercise_id,
            "weight": Decimal("50"),
            "reps": 10,
            "duration_sec": None,
            "weight_mode": "total",
            "machine_params": None,
            "rpe": 7,
            "completed_date": date(2026, 9, 7),
        }]

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(workout_load_hints, "load_hints_for_exercises", fake_hints)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/workouts/load-hints",
                json={"exercise_ids": [str(exercise_id)]},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured == {"user_id": user.id, "exercise_ids": [exercise_id]}
    assert response.json()["items"][0] == {
        "exercise_id": str(exercise_id),
        "weight": "50",
        "reps": 10,
        "duration_sec": None,
        "weight_mode": "total",
        "machine_params": None,
        "rpe": 7,
        "completed_date": "2026-09-07",
        "phase_loads": {},
    }
