"""Offline preparation must reuse server rules without mutating the diary."""

from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.main import app
from app.services import offline_workouts, program_service, scheduler, workout_service


@pytest.fixture
def scenario(monkeypatch):
    owner, program_id = uuid4(), uuid4()
    user = SimpleNamespace(id=owner, goals={"active_program_id": str(program_id)}, anthropometry={})
    program = SimpleNamespace(
        id=program_id,
        name="План",
        structure={"days": [{"day_index": 1}, {"day_index": 2}]},
        version=1,
        description=None,
        target_level=None,
        duration_weeks=8,
        workout_type="custom",
        level=None,
        is_template=True,
        publication_status="published",
        program_key="test",
        is_current=True,
        published_at=None,
        owner_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    monkeypatch.setattr(program_service, "get_program", AsyncMock(return_value=program))

    async def overview(_session, _user, day):
        occurrence = {
            "original_date": day,
            "target_date": day,
            "start_time": "10:00:00",
            "title": "День1",
            "program_id": program_id,
            "day_index": 1,
            "status": "scheduled",
        }
        return {"requested_date": day, "current": occurrence, "next": occurrence}

    monkeypatch.setattr(scheduler, "get_schedule_overview", overview)
    monkeypatch.setattr(scheduler, "latest_completed_workout_date", AsyncMock(return_value=None))

    async def plan(_session, _user, _program, **kwargs):
        assert kwargs["consume_saved_override"] is False
        return {
            "title": "Подготовленный план",
            "day_index": kwargs["day_index"],
            "week_phase": kwargs["week_phase"],
            "exercises": [],
        }

    builder = AsyncMock(side_effect=plan)
    monkeypatch.setattr(workout_service, "build_program_plan_for_user", builder)
    return user, program, builder


def test_offline_context_is_a_bounded_read_only_route():
    operation = app.openapi()["paths"]["/workouts/offline-context"]
    assert set(operation) == {"get"}
    days = next(param for param in operation["get"]["parameters"] if param["name"] == "days")
    assert days["schema"]["maximum"] == 14
    assert days["schema"]["minimum"] == 1


@pytest.mark.asyncio
async def test_prepares_fourteen_local_dates_without_starting_workouts(scenario):
    user, program, builder = scenario
    original = deepcopy(user.goals)
    session = AsyncMock()
    start = date(2026, 10, 9)
    result = await offline_workouts.prepare_context(session, user, start=start, days=14)
    assert result.owner == user.id and result.program.id == program.id
    assert [day.requested_date for day in result.days] == [
        start + timedelta(days=n) for n in range(14)
    ]
    assert result.end == date(2026, 10, 22)
    assert {row.day_index for row in result.plans} == {1, 2}
    assert {row.week_phase for row in result.plans} == {"light", "medium", "heavy"}
    assert all(row.readiness == "normal" for row in result.plans)
    assert builder.await_count == 14 * 2 * 3
    assert user.goals == original
    session.add.assert_not_called()
    session.commit.assert_not_awaited()
    session.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_readiness_variants_use_existing_builder(scenario):
    user, _, builder = scenario
    user.goals["cycle_training_enabled"] = True
    result = await offline_workouts.prepare_context(
        AsyncMock(), user, start=date(2026, 10, 9), days=1
    )
    assert {row.readiness for row in result.plans} == {"normal", "caution", "reduce", "rest"}
    assert {call.kwargs["cycle_readiness"] for call in builder.await_args_list} == {
        "normal",
        "caution",
        "reduce",
        "rest",
    }


@pytest.mark.asyncio
async def test_unavailable_program_is_not_prepared(scenario, monkeypatch):
    user, _, builder = scenario
    monkeypatch.setattr(program_service, "get_program", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as failure:
        await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 9), days=1)
    assert failure.value.status_code == 404
    builder.assert_not_awaited()


@pytest.mark.asyncio
async def test_paused_completed_and_cancelled_days_have_no_start_plans(scenario, monkeypatch):
    user, _, builder = scenario

    async def overview(_session, _user, day):
        occurrence = {
            "original_date": day,
            "target_date": day,
            "start_time": "10:00:00",
            "title": "День1",
            "program_id": user.goals["active_program_id"],
            "day_index": 1,
            "status": ["paused", "completed", "cancelled"][day.day - 9],
        }
        return {"requested_date": day, "current": occurrence, "next": None}

    monkeypatch.setattr(scheduler, "get_schedule_overview", overview)
    result = await offline_workouts.prepare_context(
        AsyncMock(), user, start=date(2026, 10, 9), days=3
    )
    assert not result.plans
    builder.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_program_still_has_fourteen_day_schedule(scenario):
    user, _, builder = scenario
    user.goals = {}
    result = await offline_workouts.prepare_context(
        AsyncMock(), user, start=date(2026, 10, 9), days=14
    )
    assert result.program is None and result.plans == [] and len(result.days) == 14
    builder.assert_not_awaited()


@pytest.mark.asyncio
async def test_dates_before_program_start_are_not_prepared(scenario):
    user, _, _ = scenario
    user.goals["active_program_started_at"] = "2026-10-11"
    result = await offline_workouts.prepare_context(
        AsyncMock(), user, start=date(2026, 10, 9), days=3
    )
    assert {row.scheduled_date for row in result.plans} == {date(2026, 10, 11)}


@pytest.mark.asyncio
async def test_move_prepares_target_date_and_program_access_is_owner_scoped(scenario, monkeypatch):
    user, program, _ = scenario

    async def overview(_session, _user, day):
        occurrence = {
            "original_date": day,
            "target_date": day + timedelta(days=1),
            "start_time": "10:00:00",
            "title": "Перенос",
            "program_id": program.id,
            "day_index": 1,
            "status": "scheduled",
            "is_override": True,
        }
        return {"requested_date": day, "current": occurrence, "next": occurrence}

    monkeypatch.setattr(scheduler, "get_schedule_overview", overview)
    result = await offline_workouts.prepare_context(
        AsyncMock(), user, start=date(2026, 10, 9), days=2
    )
    assert {row.scheduled_date for row in result.plans} == {date(2026, 10, 10)}
    lookup = program_service.get_program.await_args
    assert lookup.kwargs == {"active_program_id": str(program.id), "user_id": user.id}


@pytest.mark.asyncio
@pytest.mark.parametrize("days", [0, 15])
async def test_service_rejects_unbounded_preparation(scenario, days):
    user, _, builder = scenario
    with pytest.raises(HTTPException) as failure:
        await offline_workouts.prepare_context(
            AsyncMock(), user, start=date(2026, 10, 9), days=days
        )
    assert failure.value.status_code == 422
    builder.assert_not_awaited()


@pytest.mark.asyncio
async def test_recovery_split_also_prepares_plans_after_local_recovery_completion(scenario):
    user, _, builder = scenario
    user.goals["workout_illness_recovery"] = {"choice_pending": False, "light_cycle_active": True}
    original = deepcopy(user.goals)
    result = await offline_workouts.prepare_context(
        AsyncMock(), user, start=date(2026, 10, 9), days=1
    )
    assert {row.after_recovery for row in result.plans} == {False, True}
    assert builder.await_count == 2 * 2 * 3
    assert user.goals == original
    assert any(
        not call.args[1].goals["workout_illness_recovery"]["light_cycle_active"]
        for call in builder.await_args_list
    )
