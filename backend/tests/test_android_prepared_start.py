from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from app.schemas.android_sync import Operation
from app.schemas.workout import WorkoutPlan
from app.services.android_sync import dispatch
from app.services.offline_schedule import schedule_fingerprint


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
            "offline_schedule_fingerprint": schedule_fingerprint(user.goals),
        },
        baseRevision=None,
        createdAt=1,
    )
    with pytest.raises(HTTPException) as caught:
        await dispatch.dispatch(session, user, op)
    assert caught.value.status_code == 422
    dispatch.workouts.create_workout.assert_not_awaited()
    assert build.await_args.kwargs["consume_saved_override"] is False


@pytest.mark.asyncio
async def test_prepared_start_detects_rescheduled_occurrence_with_unchanged_exercises(monkeypatch):
    from app.schemas.workout import WorkoutCreate
    from app.services.android_sync.prepared_start import canonical_prepared_start
    from app.services import program_service, workout_service
    owner, program, exercise = uuid4(), uuid4(), uuid4()
    user = SimpleNamespace(id=owner, goals={"active_program_id":str(program), "workout_schedule_overrides":[{"original_date":"2026-10-09", "target_date":"2026-10-10", "target_time":"10:00"}]})
    plan = WorkoutPlan(day_index=1,exercises=[{"exercise_id":exercise,"order":1,"target_sets":2}])
    payload = WorkoutCreate(program_id=program, scheduled_date=date(2026,10,9), day_index=1,week_phase="medium",plan=plan)
    session = SimpleNamespace(scalar=AsyncMock(return_value=None))
    monkeypatch.setattr(program_service,"get_program",AsyncMock(return_value=SimpleNamespace(id=program)))
    monkeypatch.setattr(workout_service,"build_program_plan_for_user",AsyncMock(return_value=plan.model_dump(mode="json")))
    with pytest.raises(HTTPException) as caught:
        await canonical_prepared_start(session,user,payload,{"offline_prepared_at":"2026-10-09T08:00:00Z","offline_schedule_fingerprint":"0"*64})
    assert caught.value.status_code == 422
    assert "расписание" in caught.value.detail.lower()
