"""Exercise explorer, recent aggregation, and pin regressions."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql

from app.core.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models.exercise import Exercise
from app.services import exercise_explorer


class Rows:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def all(self):
        return self.rows


class ExplorerSession:
    def __init__(self, exercise: Exercise) -> None:
        self.exercise = exercise
        self.statements: list[object] = []

    async def scalar(self, statement):
        self.statements.append(statement)
        return 1

    async def execute(self, statement):
        self.statements.append(statement)
        return Rows([(self.exercise, datetime.now(UTC), date(2026, 9, 8), 4)])

    async def scalars(self, statement):
        self.statements.append(statement)
        return Rows(["chest", "back"])


@pytest.mark.asyncio
async def test_explorer_is_bounded_user_scoped_and_marks_recent_pin() -> None:
    exercise = Exercise(
        id=uuid.uuid4(),
        name_ru="Жим гантелей",
        muscle_group="chest",
        difficulty=2,
    )
    user_id = uuid.uuid4()
    session = ExplorerSession(exercise)

    result = await exercise_explorer.list_explorer(  # type: ignore[arg-type]
        session,
        user_id=user_id,
        page=1,
        page_size=20,
        scope="recent",
    )

    item_sql = str(session.statements[1].compile(dialect=postgresql.dialect()))
    assert "workouts.user_id" in item_sql
    assert "workouts.status" in item_sql
    assert "workout_sets.is_completed" in item_sql
    assert "user_exercise_pins.user_id" in item_sql
    assert "LIMIT" in item_sql
    assert result["total"] == 1
    assert result["items"][0]["is_pinned"] is True
    assert result["items"][0]["completed_workouts"] == 4
    assert result["muscle_groups"] == ["chest", "back"]


class PinSession:
    def __init__(self, scalar_values: list[object]) -> None:
        self.scalar_values = iter(scalar_values)
        self.added: list[object] = []
        self.deleted: list[object] = []
        self.commits = 0

    async def execute(self, _statement):
        return Rows([])

    async def scalar(self, _statement):
        return next(self.scalar_values)

    def add(self, value):
        self.added.append(value)

    async def delete(self, value):
        self.deleted.append(value)

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_pin_limit_is_enforced_under_user_lock() -> None:
    session = PinSession([uuid.uuid4(), None, exercise_explorer.PIN_LIMIT])
    with pytest.raises(exercise_explorer.ExercisePinLimitError):
        await exercise_explorer.set_pinned(  # type: ignore[arg-type]
            session,
            user_id=uuid.uuid4(),
            exercise_id=uuid.uuid4(),
            pinned=True,
        )
    assert session.added == []
    assert session.commits == 0


@pytest.mark.asyncio
async def test_unpin_is_idempotent_and_returns_current_count() -> None:
    exercise_id = uuid.uuid4()
    session = PinSession([exercise_id, None, 0])
    result = await exercise_explorer.set_pinned(  # type: ignore[arg-type]
        session,
        user_id=uuid.uuid4(),
        exercise_id=exercise_id,
        pinned=False,
    )
    assert result["is_pinned"] is False
    assert result["pinned_count"] == 0
    assert session.commits == 1


@pytest.mark.asyncio
async def test_account_pin_merge_prefers_selected_profile_and_keeps_limit() -> None:
    source_user_id = uuid.uuid4()
    target_user_id = uuid.uuid4()
    exercise_ids = [uuid.uuid4() for _ in range(9)]
    target_rows = [
        SimpleNamespace(user_id=target_user_id, exercise_id=value)
        for value in exercise_ids[:5]
    ]
    source_rows = [
        SimpleNamespace(user_id=source_user_id, exercise_id=value)
        for value in exercise_ids[4:]
    ]

    class MergeSession:
        def __init__(self) -> None:
            self.results = iter((Rows(target_rows), Rows(source_rows)))
            self.deleted: list[object] = []

        async def scalars(self, _statement):
            return next(self.results)

        async def delete(self, row):
            self.deleted.append(row)

    session = MergeSession()
    await exercise_explorer.merge_user_pins(  # type: ignore[arg-type]
        session,
        source_user_id=source_user_id,
        target_user_id=target_user_id,
        prefer_source=True,
    )

    kept = [
        row for row in [*target_rows, *source_rows]
        if row not in session.deleted
    ]
    assert len(kept) == exercise_explorer.PIN_LIMIT
    assert {row.exercise_id for row in kept} == set(exercise_ids[:3] + exercise_ids[4:])
    assert all(row.user_id == target_user_id for row in kept)


@pytest.mark.asyncio
async def test_explorer_route_precedes_uuid_detail_route_and_requires_plus(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    exercise_id = uuid.uuid4()
    now = datetime.now(UTC)
    db_session = SimpleNamespace(scalar=AsyncMock(return_value=uuid.uuid4()))

    async def fake_db():
        yield db_session

    async def fake_list(_session, **_kwargs):
        return {
            "items": [{
                "id": exercise_id,
                "name_ru": "Жим гантелей",
                "muscle_group": "chest",
                "difficulty": 2,
                "created_at": now,
                "updated_at": now,
                "is_pinned": True,
                "last_completed_date": date(2026, 9, 8),
                "completed_workouts": 4,
            }],
            "total": 1,
            "page": 1,
            "page_size": 20,
            "muscle_groups": ["chest"],
            "pin_limit": 8,
        }

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(exercise_explorer, "list_explorer", fake_list)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/exercises/explorer?scope=recent")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["items"][0]["is_pinned"] is True
