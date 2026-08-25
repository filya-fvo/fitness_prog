"""Offline retries must converge on one server-side workout state."""

from datetime import date
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout
from app.schemas.workout import WorkoutCompleteRequest
from app.services import workout_service


class NoCommitSession:
    async def commit(self) -> None:
        raise AssertionError("an idempotent completion must not write again")


@pytest.mark.asyncio
async def test_complete_workout_returns_existing_completed_snapshot(monkeypatch) -> None:
    user = User(id=uuid4(), telegram_id=None, anthropometry={}, goals={})
    workout = Workout(
        id=uuid4(),
        user_id=user.id,
        scheduled_date=date(2026, 8, 13),
        status="completed",
        plan={},
        rpe=7,
    )

    async def fake_get(*_args, **_kwargs):
        return workout

    monkeypatch.setattr(workout_service, "_get_workout_for_user", fake_get)
    result = await workout_service.complete_workout(
        NoCommitSession(),  # type: ignore[arg-type]
        user,
        workout.id,
        WorkoutCompleteRequest(rpe=9),
    )
    assert result is workout
    assert result.rpe == 7


@pytest.mark.asyncio
async def test_start_program_rejects_second_workout_after_completion() -> None:
    user = User(id=uuid4(), telegram_id=None, anthropometry={}, goals={})
    program = Program(
        id=uuid4(),
        name="Тестовая программа",
        description="",
        target_level="beginner",
        duration_weeks=4,
        structure={"schedule": []},
        is_template=True,
    )
    completed = Workout(
        id=uuid4(),
        user_id=user.id,
        program_id=program.id,
        scheduled_date=date(2026, 8, 24),
        status="completed",
        plan={},
    )
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[program, completed])

    with pytest.raises(HTTPException) as exc_info:
        await workout_service.start_program_workout(
            session,
            user,
            program.id,
            scheduled_date=date(2026, 8, 24),
        )

    assert exc_info.value.status_code == 409


def four_day_program(program_id) -> Program:
    return Program(
        id=program_id,
        name="Четыре дня",
        description="",
        target_level="intermediate",
        duration_weeks=8,
        structure={
            "schedule": [
                {"day_index": index, "name": f"День {index}", "exercises": []}
                for index in range(1, 5)
            ]
        },
        is_template=True,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("initial_status", ["planned", "completed"])
async def test_completion_advances_or_repairs_program_cursor(monkeypatch, initial_status: str) -> None:
    user_id, program_id, workout_id = uuid4(), uuid4(), uuid4()
    user = User(
        id=user_id,
        telegram_id=None,
        anthropometry={},
        goals={
            "active_program_id": str(program_id),
            "active_program_next_day": 3,
            "active_program_week_phase": "medium",
            "active_program_phase_source": "auto",
            "active_program_workouts_in_phase": 2,
        },
    )
    workout = Workout(
        id=workout_id,
        user_id=user_id,
        program_id=program_id,
        scheduled_date=date(2026, 8, 24),
        status=initial_status,
        plan={"day_index": 3, "week_phase": "medium"},
    )

    async def fake_get(*_args, **_kwargs):
        return workout

    monkeypatch.setattr(workout_service, "_get_workout_for_user", fake_get)
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[four_day_program(program_id), workout_id])

    result = await workout_service.complete_workout(
        session,
        user,
        workout_id,
        WorkoutCompleteRequest(rpe=8),
    )

    assert result.status == "completed"
    assert user.goals["active_program_next_day"] == 4
    assert user.goals["active_program_week_phase"] == "medium"
    assert user.goals["active_program_workouts_in_phase"] == 3
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_completion_wraps_program_and_phase(monkeypatch) -> None:
    user_id, program_id, workout_id = uuid4(), uuid4(), uuid4()
    user = User(
        id=user_id,
        telegram_id=None,
        anthropometry={},
        goals={
            "active_program_id": str(program_id),
            "active_program_next_day": 4,
            "active_program_week_phase": "medium",
            "active_program_phase_source": "auto",
            "active_program_workouts_in_phase": 3,
        },
    )
    workout = Workout(
        id=workout_id,
        user_id=user_id,
        program_id=program_id,
        scheduled_date=date(2026, 8, 26),
        status="planned",
        plan={"day_index": 4, "week_phase": "medium"},
    )

    async def fake_get(*_args, **_kwargs):
        return workout

    monkeypatch.setattr(workout_service, "_get_workout_for_user", fake_get)
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[four_day_program(program_id), workout_id])

    await workout_service.complete_workout(
        session,
        user,
        workout_id,
        WorkoutCompleteRequest(),
    )

    assert user.goals["active_program_next_day"] == 1
    assert user.goals["active_program_week_phase"] == "heavy"
    assert user.goals["active_program_phase_source"] == "manual"
    assert user.goals["active_program_workouts_in_phase"] == 0
