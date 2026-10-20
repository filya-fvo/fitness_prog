"""Skipped ordinary participants must survive a fetch on another device."""
from datetime import date
from uuid import uuid4
import pytest
from app.schemas.workout import WorkoutCreate, WorkoutSetCreate, WorkoutSetResponse
from app.services import workout_service
from tests.test_workout_customization import database as database


def test_skip_flag_is_explicit_in_v2_write_contract():
    payload = WorkoutSetCreate.model_validate({"execution_version": 2, "exercise_id": str(uuid4()), "set_number": 1, "is_skipped": True})
    assert getattr(payload, "is_skipped", False)


@pytest.mark.asyncio
async def test_skip_survives_server_fetch_and_undo_and_does_not_count_as_work(database):
    session, owner, _, _, _, base, _ = database
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(scheduled_date=date(2026, 10, 19), execution_version=2,
        plan={"execution_version": 2, "exercises": [{"exercise_id": str(base.id), "order": 1, "target_sets": 2}]}))
    skipped = await workout_service.add_workout_set(session, owner, workout.id, WorkoutSetCreate.model_validate({"execution_version": 2,
        "exercise_id": str(base.id), "set_number": 1, "is_skipped": True, "base_execution_revision": 0, "client_operation_id": str(uuid4())}))
    assert WorkoutSetResponse.model_validate(skipped).model_dump().get("is_skipped") is True
    fetched = await workout_service.get_workout(session, owner, workout.id)
    assert getattr(fetched.sets[0], "is_skipped", False) and not fetched.sets[0].is_completed
    undo = WorkoutSetCreate(execution_version=2, exercise_id=base.id, set_number=1, base_execution_revision=1, client_operation_id=uuid4())
    undone = await workout_service.add_workout_set(session, owner, workout.id, undo)
    from hashlib import sha256
    from app.models.workout_set_part import WorkoutSetExecutionReceipt
    receipt = await session.get(WorkoutSetExecutionReceipt, (undone.id, undo.client_operation_id))
    assert receipt.request_hash == sha256(undo.model_dump_json(exclude={"is_skipped"}).encode()).hexdigest()
    assert (await workout_service.add_workout_set(session, owner, workout.id, undo)).execution_revision == 2
    assert not undone.is_skipped and not undone.is_completed

@pytest.mark.parametrize("extra", [{"is_completed": True}, {"execution_kind": "cluster"}, {"execution_version": 1}])
def test_skip_cannot_be_completed_or_flatten_compound_or_use_legacy_write(extra):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        WorkoutSetCreate.model_validate({"execution_version": 2, "exercise_id": str(uuid4()), "set_number": 1, "is_skipped": True, **extra})


@pytest.mark.asyncio
async def test_skip_migration_rollback_and_default_preserve_existing_ordinary_history(database):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    from tests.test_workout_customization import migration
    session, owner, _, _, _, base, _ = database
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(scheduled_date=date(2026, 10, 19), exercise_ids=[base.id], sets_per_exercise=1))
    row = await workout_service.add_workout_set(session, owner, workout.id, WorkoutSetCreate(exercise_id=base.id, set_number=1, reps=12, weight=50, is_completed=True))
    identity = row.id
    raw = await (await session.connection()).get_raw_connection()
    await raw.driver_connection.execute("ALTER TABLE workout_sets DROP COLUMN is_skipped")
    sql = migration().with_name("20261020000000_workout_set_skips.sql").read_text(encoding="utf-8-sig")
    with pytest.raises(DBAPIError):
        async with session.begin_nested():
            # Materialize SQLAlchemy's lazy SAVEPOINT before using the raw driver.
            await session.connection()
            await raw.driver_connection.execute(sql)
            await session.execute(text("SELECT 1 / 0"))
    assert not await session.scalar(text("SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='workout_sets' AND column_name='is_skipped'"))
    await raw.driver_connection.execute(sql)
    saved = (await session.execute(text("SELECT reps, weight, is_completed, is_skipped FROM workout_sets WHERE id=:id"), {"id": identity})).mappings().one()
    assert saved["reps"] == 12 and saved["weight"] == 50 and saved["is_completed"] and not saved["is_skipped"]
