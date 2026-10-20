"""Recovery timestamps and immutable semantic snapshots, using isolated PostgreSQL."""
from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4
import pytest
from fastapi import HTTPException
from app.schemas.workout import WorkoutCompleteRequest, WorkoutCreate
from app.services import workout_service, workout_execution, workout_customization
from tests.test_workout_customization import database as database, request
from tests.test_workout_execution import create_method_workout, method_plan


def test_semantic_snapshot_accepts_decimal_encoding_but_rejects_rest_change():
    original = method_plan()
    encoded = deepcopy(original)
    for part in encoded["exercises"][0]["set_methods"][0]["parts"]:
        part["target_weight"] = "100.00"
    workout_execution.validate_plan_edit(original, encoded)
    changed = deepcopy(encoded)
    changed["exercises"][0]["rest_sec"] = 150
    with pytest.raises(HTTPException) as caught:
        workout_execution.validate_plan_edit(original, changed)
    assert caught.value.status_code == 409


@pytest.mark.asyncio
async def test_offline_finish_preserves_confirmation_time_and_duration_on_retry(database):
    session, owner, workout = await create_method_workout(database)
    finished = datetime.now(UTC) - timedelta(hours=20)
    payload = WorkoutCompleteRequest.model_validate({"execution_version": 2, "completed_at": finished.isoformat(), "duration_sec": 600, "rpe": 7})
    result = await workout_service.complete_workout(session, owner, workout.id, payload)
    assert result.completed_at == finished
    assert result.duration_sec == 600
    assert result.started_at == finished - timedelta(seconds=600)
    repeated = await workout_service.complete_workout(session, owner, workout.id, payload)
    assert repeated.completed_at == finished and repeated.duration_sec == 600


@pytest.mark.asyncio
async def test_start_consumes_only_occurrence_and_prevents_late_preparation_write(database):
    session, owner, _, program, added, base, _ = database
    permanent = request(program, patch={"exercise_overrides": [{"exercise_id": str(base.id), "rest_sec": 90}]})
    await workout_customization.save_customization(session, owner, permanent)
    occurrence = request(program, added, scope="occurrence")
    await workout_customization.save_customization(session, owner, occurrence)
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(program_id=program.id, day_index=1, scheduled_date=date(2026, 10, 19), execution_version=2, client_workout_id=uuid4()))
    assert len(workout.plan["exercises"]) == 2
    stored = await workout_customization.get_customization(session, owner, program_id=program.id, day_index=1, scope="occurrence", scheduled_date=date(2026, 10, 19))
    assert stored.revision == 2 and not stored.patch.added_exercises
    private = await workout_customization.get_customization(session, owner, program_id=program.id, day_index=1, scope="program_day")
    assert private.revision == 1 and private.patch.exercise_overrides[0].rest_sec == 90
    with pytest.raises(HTTPException) as caught:
        await workout_customization.save_customization(session, owner, occurrence.model_copy(update={"operation_id": uuid4(), "base_revision": stored.revision}))
    assert caught.value.status_code == 409

@pytest.mark.parametrize("extra", [
    {"completed_at": "2026-10-19T09:10:00Z"}, {"duration_sec": 600},
    {"completed_at": "2026-10-19T09:10:00", "duration_sec": 600},
    {"completed_at": "2026-10-19T09:10:00Z", "duration_sec": 604801},
])
def test_completion_confirmation_is_bounded_and_requires_aware_timestamp_pair(extra):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        WorkoutCompleteRequest.model_validate({"execution_version": 2, **extra})


@pytest.mark.asyncio
async def test_future_confirmation_rejected_without_completing_workout(database):
    session, owner, workout = await create_method_workout(database)
    payload = WorkoutCompleteRequest(execution_version=2, completed_at=datetime.now(UTC) + timedelta(hours=1), duration_sec=600)
    with pytest.raises(HTTPException) as caught:
        await workout_service.complete_workout(session, owner, workout.id, payload)
    assert caught.value.status_code == 422 and workout.status == "planned"
