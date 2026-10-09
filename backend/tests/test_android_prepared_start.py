from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from app.schemas.android_sync import Operation
from app.schemas.workout import WorkoutPlan
from app.services.android_sync import dispatch


@pytest.mark.asyncio
async def test_prepared_start_rejects_changed_plan_before_consuming(monkeypatch):
    owner, program, exercise = uuid4(), uuid4(), uuid4()
    session = SimpleNamespace(scalar=AsyncMock(return_value=None))
    user = SimpleNamespace(id=owner, goals={"active_program_id": str(program)})
    monkeypatch.setattr(dispatch.workouts, "create_workout", AsyncMock())
    from app.services import program_service, workout_service

    monkeypatch.setattr(
        program_service, "get_program", AsyncMock(return_value=SimpleNamespace(id=program))
    )
    build = AsyncMock(
        return_value={
            "day_index": 1,
            "exercises": [{"exercise_id": str(exercise), "order": 1, "target_sets": 4}],
        }
    )
    monkeypatch.setattr(workout_service, "build_program_plan_for_user", build)
    plan = WorkoutPlan(
        day_index=1, exercises=[{"exercise_id": exercise, "order": 1, "target_sets": 2}]
    )
    op = Operation(
        id=uuid4(),
        owner=owner,
        kind="workout",
        entityId=str(uuid4()),
        action="create",
        body={
            "scheduled_date": str(date.today()),
            "program_id": str(program),
            "day_index": 1,
            "week_phase": "medium",
            "plan": plan.model_dump(mode="json"),
            "offline_prepared_at": "2026-10-09T08:00:00Z",
        },
        baseRevision=None,
        createdAt=1,
    )
    with pytest.raises(HTTPException) as caught:
        await dispatch.dispatch(session, user, op)
    assert caught.value.status_code == 422
    dispatch.workouts.create_workout.assert_not_awaited()
    assert build.await_args.kwargs["consume_saved_override"] is False
