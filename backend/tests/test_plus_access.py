"""Server-side FREE / PLUS boundaries and daily-flow regressions."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.core.database import get_db
from app.deps import ensure_plus_for_past_date, get_current_user, user_local_day
from app.main import app
from app.services import ai_engine, body_measurements, daily_metrics, workout_service


class AccessSession:
    def __init__(self, *, plus: bool) -> None:
        self.plus = plus
        self.statements: list[object] = []

    async def scalar(self, statement):
        self.statements.append(statement)
        return uuid.uuid4() if self.plus else None

    async def scalars(self, statement):
        self.statements.append(statement)
        return SimpleNamespace(all=lambda: [])


async def _request_as(
    user: SimpleNamespace,
    session: AccessSession,
    method: str,
    path: str,
    **kwargs,
) -> httpx.Response:
    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path", "expected_feature"),
    [
        ("GET", "/workouts/history", "workout_history"),
        ("GET", "/measurements/range", "measurement_history"),
        ("GET", "/measurements/analytics", "measurement_analytics"),
        ("GET", "/nutrition/range", "nutrition_history"),
        ("GET", "/metrics/range", "daily_metrics_history"),
        ("GET", "/workouts/regularity", "workout_regularity"),
        ("POST", "/ai/analyze", "ai_progress_analysis"),
    ],
)
async def test_free_cannot_read_plus_endpoints(
    method: str,
    path: str,
    expected_feature: str,
) -> None:
    response = await _request_as(
        SimpleNamespace(id=uuid.uuid4(), goals={}),
        AccessSession(plus=False),
        method,
        path,
        json={"days": 14} if method == "POST" else None,
    )

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "plus_required"
    assert detail["feature"] == expected_feature
    assert detail["message"].endswith("в PLUS")


@pytest.mark.asyncio
async def test_plus_can_read_workout_history(monkeypatch) -> None:
    async def fake_history(*_args, **_kwargs):
        return [], 0

    monkeypatch.setattr(workout_service, "list_workout_history", fake_history)
    response = await _request_as(
        SimpleNamespace(id=uuid.uuid4(), goals={}),
        AccessSession(plus=True),
        "GET",
        "/workouts/history",
    )

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


@pytest.mark.asyncio
async def test_free_can_read_and_save_measurement_for_local_today(monkeypatch) -> None:
    user = SimpleNamespace(
        id=uuid.uuid4(),
        goals={"notification_settings": {"timezone": "Asia/Tokyo"}},
    )
    session = AccessSession(plus=False)

    async def fake_get(*_args):
        return None

    async def fake_save(*_args):
        return None

    monkeypatch.setattr(body_measurements, "get_for_day", fake_get)
    monkeypatch.setattr(body_measurements, "save_for_day", fake_save)
    expected_day = user_local_day(user)

    get_response = await _request_as(user, session, "GET", "/measurements/daily")
    put_response = await _request_as(
        user,
        session,
        "PUT",
        "/measurements/daily",
        json={"weight_kg": 70},
    )

    assert get_response.status_code == 200
    assert get_response.json()["date"] == expected_day.isoformat()
    assert put_response.status_code == 200
    assert put_response.json()["date"] == expected_day.isoformat()
    assert session.statements == []


@pytest.mark.asyncio
async def test_free_daily_metrics_remain_available(monkeypatch) -> None:
    async def fake_get(*_args):
        return None

    async def fake_save(*_args):
        return None

    monkeypatch.setattr(daily_metrics, "get_for_day", fake_get)
    monkeypatch.setattr(daily_metrics, "save_for_day", fake_save)
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    session = AccessSession(plus=False)

    get_response = await _request_as(user, session, "GET", "/metrics/daily")
    put_response = await _request_as(
        user,
        session,
        "PUT",
        "/metrics/daily",
        json={"steps": 5000},
    )

    assert get_response.status_code == 200
    assert put_response.status_code == 200
    assert session.statements == []


@pytest.mark.asyncio
async def test_free_can_create_and_complete_todays_workout(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    workout_id = uuid.uuid4()
    now = datetime.now(UTC)
    workout = SimpleNamespace(
        id=workout_id,
        user_id=user.id,
        program_id=None,
        scheduled_date=user_local_day(user),
        status="planned",
        ai_notes=None,
        rpe=None,
        started_at=None,
        completed_at=None,
        title="Тестовая тренировка",
        workout_type="custom",
        plan={},
        duration_sec=None,
        created_at=now,
        updated_at=now,
        sets=[],
    )

    async def fake_create(*_args, **_kwargs):
        return workout

    async def fake_complete(*_args, **_kwargs):
        workout.status = "completed"
        workout.completed_at = now
        return workout

    monkeypatch.setattr(workout_service, "create_workout", fake_create)
    monkeypatch.setattr(workout_service, "complete_workout", fake_complete)
    session = AccessSession(plus=False)
    create_response = await _request_as(
        user,
        session,
        "POST",
        "/workouts",
        json={
            "scheduled_date": workout.scheduled_date.isoformat(),
            "title": workout.title,
            "workout_type": workout.workout_type,
        },
    )
    complete_response = await _request_as(
        user,
        session,
        "PUT",
        f"/workouts/{workout_id}/complete",
        json={"rpe": 7},
    )

    assert create_response.status_code == 201
    assert complete_response.status_code == 200
    assert complete_response.json()["status"] == "completed"
    assert session.statements == []


@pytest.mark.asyncio
async def test_past_date_boundary_uses_the_users_local_calendar_day() -> None:
    user = SimpleNamespace(
        id=uuid.uuid4(),
        goals={"notification_settings": {"timezone": "Pacific/Kiritimati"}},
    )
    session = AccessSession(plus=False)
    utc_day = date(2026, 9, 8)

    with pytest.raises(HTTPException) as exc_info:
        await ensure_plus_for_past_date(
            session,  # type: ignore[arg-type]
            user,  # type: ignore[arg-type]
            utc_day,
            feature="measurement_history",
            message="История замеров доступна в PLUS",
            now=datetime(2026, 9, 8, 12, tzinfo=UTC),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "plus_required"
    assert len(session.statements) == 1


@pytest.mark.asyncio
async def test_free_cannot_read_or_edit_past_measurement() -> None:
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    old_day = user_local_day(user) - timedelta(days=1)
    session = AccessSession(plus=False)

    for method, kwargs in (
        ("GET", {}),
        ("PUT", {"json": {"weight_kg": 70}}),
        ("DELETE", {}),
    ):
        response = await _request_as(
            user,
            session,
            method,
            f"/measurements/daily?date={old_day.isoformat()}",
            **kwargs,
        )
        assert response.status_code == 403
        assert response.json()["detail"]["feature"] == "measurement_history"


@pytest.mark.asyncio
async def test_free_workout_lookup_hides_history_and_unknown_ids(monkeypatch) -> None:
    captured: list[date] = []

    async def fake_operational(*_args, local_day: date, **_kwargs):
        captured.append(local_day)
        return None

    monkeypatch.setattr(workout_service, "get_operational_workout", fake_operational)
    response = await _request_as(
        SimpleNamespace(id=uuid.uuid4(), goals={}),
        AccessSession(plus=False),
        "GET",
        f"/workouts/{uuid.uuid4()}",
    )

    assert response.status_code == 403
    assert response.json()["detail"] == {
        "code": "plus_required",
        "feature": "workout_details",
        "message": "Прошлые тренировки доступны в PLUS",
    }
    assert captured == [user_local_day(SimpleNamespace(goals={}))]


@pytest.mark.asyncio
async def test_free_ai_chat_and_chat_history_remain_available(monkeypatch) -> None:
    session_id = uuid.uuid4()
    captured: dict[str, object] = {}

    async def fake_chat(*_args, **kwargs):
        captured.update(kwargs)
        return session_id, "Готово", "rule"

    monkeypatch.setattr(ai_engine, "chat", fake_chat)
    user = SimpleNamespace(id=uuid.uuid4(), goals={})
    history = await _request_as(
        user,
        AccessSession(plus=False),
        "GET",
        "/ai/history?day=2026-09-08",
    )
    chat = await _request_as(
        user,
        AccessSession(plus=False),
        "POST",
        "/ai/chat",
        json={"message": "Что делать сегодня?"},
    )

    assert history.status_code == 200
    assert history.json() == {"session_id": None, "messages": []}
    assert chat.status_code == 200
    assert chat.json()["reply"] == "Готово"
    assert captured["include_historical_context"] is False

    captured.clear()
    plus_chat = await _request_as(
        user,
        AccessSession(plus=True),
        "POST",
        "/ai/chat",
        json={"message": "Как меняется мой прогресс?"},
    )
    assert plus_chat.status_code == 200
    assert captured["include_historical_context"] is True


@pytest.mark.asyncio
async def test_free_ai_chat_cannot_bypass_progress_analysis(monkeypatch) -> None:
    stored: dict[str, object] = {}

    async def fake_rag(*_args, **_kwargs):
        return []

    async def forbidden_evidence(*_args, **_kwargs):
        raise AssertionError("FREE chat must not query historical evidence")

    async def fake_store(*_args, **kwargs):
        stored.update(kwargs)

    monkeypatch.setattr(ai_engine, "retrieve_exercise_context", fake_rag)
    monkeypatch.setattr(ai_engine, "build_analysis_evidence", forbidden_evidence)
    monkeypatch.setattr(ai_engine, "store_exchange", fake_store)
    session_id, reply, source = await ai_engine.chat(
        SimpleNamespace(),  # type: ignore[arg-type]
        SimpleNamespace(id=uuid.uuid4()),  # type: ignore[arg-type]
        message="Проанализируй мой прогресс за две недели",
        session_id=None,
        settings=SimpleNamespace(),  # type: ignore[arg-type]
        include_historical_context=False,
    )

    assert isinstance(session_id, uuid.UUID)
    assert "доступен в PLUS" in reply
    assert source == "rule"
    assert stored["assistant_content"] == reply


@pytest.mark.asyncio
async def test_free_label_route_is_not_mistaken_for_plus_history() -> None:
    response = await _request_as(
        SimpleNamespace(id=uuid.uuid4(), goals={}),
        AccessSession(plus=False),
        "POST",
        "/nutrition/label/recognize",
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "missing"
