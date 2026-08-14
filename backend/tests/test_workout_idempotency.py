"""Offline retries must converge on one server-side workout state."""

from datetime import date
from uuid import uuid4

import pytest

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
