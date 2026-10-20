"""Real HTTP query strings must opt in to compound workout reads."""
from datetime import date, datetime, UTC
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from app.core.database import get_db
from app.deps import get_current_user
from app.main import app
from app.services import exercise_progress, offline_workouts


@pytest.fixture
def context(monkeypatch):
    owner, exercise = uuid4(), uuid4()
    user = SimpleNamespace(id=owner, goals={})
    session = SimpleNamespace(scalar=AsyncMock(return_value=uuid4()))

    async def database():
        yield session

    prepared = AsyncMock(return_value={"version": 1, "owner": owner, "prepared_at": datetime.now(UTC),
        "schedule_fingerprint": "0" * 64, "start": date(2026, 10, 21), "end": date(2026, 10, 21),
        "program": None, "days": [], "plans": []})
    progress = AsyncMock(return_value={"exercise_id": exercise, "period_start": date(2026, 1, 1),
        "period_end": date(2026, 10, 21), "points": [], "summary": {
            "total_weight": {"latest": None, "best": None, "change": None},
            "estimated_1rm": {"latest": None, "best": None, "change": None}},
        "diary": [], "next_diary_cursor": None})
    monkeypatch.setattr(offline_workouts, "prepare_context", prepared)
    monkeypatch.setattr(exercise_progress, "get_exercise_progress", progress)
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield prepared, progress, exercise
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("version", [None, "1", "2"])
@pytest.mark.parametrize("route", ["offline", "progress"])
async def test_http_execution_version_reaches_correct_read_contract(context, version, route):
    prepared, progress, exercise = context
    params = {"execution_version": version} if version is not None else {}
    path = "/workouts/offline-context" if route == "offline" else f"/workouts/exercises/{exercise}/progress"
    if route == "offline":
        params.update(start="2026-10-21", days="1")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(path, params=params)
    assert response.status_code == 200, response.text
    if route == "offline":
        assert prepared.await_args.kwargs["execution_version"] == (None if version is None else int(version))
    else:
        assert progress.await_args.kwargs["include_compound"] is (version == "2")


@pytest.mark.parametrize("version", ["0", "3", "-1", "2.5", "other", ""])
@pytest.mark.parametrize("route", ["offline", "progress"])
async def test_http_execution_version_rejects_unsupported_values(context, version, route):
    prepared, progress, exercise = context
    path = "/workouts/offline-context" if route == "offline" else f"/workouts/exercises/{exercise}/progress"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(path, params={"start": "2026-10-21", "execution_version": version})
    assert response.status_code == 422
    prepared.assert_not_awaited()
    progress.assert_not_awaited()
