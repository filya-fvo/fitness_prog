"""Structured methods must survive validation instead of becoming ordinary sets."""
from uuid import uuid4
from datetime import date
from fastapi import HTTPException
from app.schemas.workout import WorkoutCreate, WorkoutSetCreate, WorkoutCompleteRequest
from app.services import workout_service
from tests.test_workout_customization import database as database

import pytest
from pydantic import ValidationError

from app.schemas.workout import WorkoutPlan


def method_plan(exercise_id=None, kind="cluster"):
    return {"execution_version": 2, "exercises": [{"exercise_id": str(exercise_id or uuid4()), "order": 1,
        "target_sets": 1, "rest_sec": 120, "set_methods": [{"set_number": 1, "kind": kind, "parts": [
            {"target_reps": 4, "target_weight": weight, "pause_after_sec": 20 if index < 2 else 0}
            for index, weight in enumerate([100, 100, 100] if kind == "cluster" else [30, 25, 20])]}]}]}


def test_cluster_plan_preserves_three_parts_of_four():
    plan = WorkoutPlan.model_validate(method_plan())
    assert getattr(plan, "execution_version", None) == 2
    assert len(plan.exercises[0].set_methods[0].parts) == 3
    assert [part.target_reps for part in plan.exercises[0].set_methods[0].parts] == [4, 4, 4]


@pytest.mark.parametrize("kind,weights", [("cluster", [100, 90, 100]), ("drop", [30, 35, 20])])
def test_method_rejects_incompatible_weights(kind, weights):
    raw = method_plan(kind=kind)
    for part, weight in zip(raw["exercises"][0]["set_methods"][0]["parts"], weights):
        part["target_weight"] = weight
    with pytest.raises(ValidationError):
        WorkoutPlan.model_validate(raw)


def test_group_references_must_belong_to_the_plan():
    raw = method_plan()
    raw["groups"] = [{"id": str(uuid4()), "kind": "superset", "exercise_ids": [raw["exercises"][0]["exercise_id"], str(uuid4())], "rounds": 1}]
    with pytest.raises(ValidationError):
        WorkoutPlan.model_validate(raw)


def test_advanced_methods_require_explicit_format_version():
    raw = method_plan()
    raw.pop("execution_version")
    with pytest.raises(ValidationError):
        WorkoutPlan.model_validate(raw)




async def create_method_workout(database, kind="cluster"):
    session, owner, _, _, _, base, _ = database
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(
        scheduled_date=date(2026, 10, 19), client_workout_id=uuid4(), execution_version=2,
        plan=method_plan(base.id, kind),
    ))
    return session, owner, workout


def recorded_parts(parent):
    return [{"id": part.id, "ordinal": part.ordinal, "reps": 4, "weight": 100,
             "status": "completed" if part.ordinal < 3 else "pending", "rest_after_sec": part.rest_after_sec}
            for part in parent.parts]


@pytest.mark.asyncio
async def test_structured_parts_partial_retry_stale_and_original_receipt(database):
    session, owner, workout = await create_method_workout(database)
    parent = workout.sets[0]
    assert len(parent.parts) == 3
    parts = recorded_parts(parent)
    data = WorkoutSetCreate(exercise_id=parent.exercise_id, set_number=1, execution_version=2,
        execution_kind="cluster", base_execution_revision=0, client_operation_id=uuid4(),
        parts=parts, is_completed=True)
    first = await workout_service.add_workout_set(session, owner, workout.id, data)
    assert first.execution_revision == 1 and not first.is_completed
    assert first.reps is None and first.weight is None
    assert len(first.parts) == 3
    retry = await workout_service.add_workout_set(session, owner, workout.id, data)
    assert retry.execution_revision == 1
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, owner, workout.id, data.model_copy(update={"client_operation_id": uuid4()}))
    assert caught.value.status_code == 409
    parts[-1]["status"] = "completed"
    final = data.model_copy(update={"base_execution_revision": 1, "client_operation_id": uuid4(), "parts": [type(data.parts[0]).model_validate(p) for p in parts]})
    saved = await workout_service.add_workout_set(session, owner, workout.id, final)
    assert saved.execution_revision == 2 and saved.is_completed
    replay = await workout_service.add_workout_set(session, owner, workout.id, data)
    assert replay.execution_revision == 1 and not replay.is_completed
    current = await workout_service.get_workout(session, owner, workout.id)
    assert current.sets[0].execution_revision == 2


@pytest.mark.asyncio
async def test_legacy_writes_cannot_strip_structured_results(database):
    session, owner, workout = await create_method_workout(database)
    parent = workout.sets[0]
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, owner, workout.id, WorkoutSetCreate(
            exercise_id=parent.exercise_id, set_number=1, reps=12, weight=100, is_completed=True))
    assert caught.value.status_code == 409
    with pytest.raises(HTTPException) as caught:
        await workout_service.complete_workout(session, owner, workout.id, WorkoutCompleteRequest())
    assert caught.value.status_code == 409
    raw = method_plan(parent.exercise_id)
    raw.pop("execution_version")
    raw["exercises"][0].pop("set_methods")
    with pytest.raises(HTTPException) as caught:
        await workout_service.update_workout_plan(session, owner, workout.id, WorkoutPlan.model_validate(raw))
    assert caught.value.status_code == 409
    assert len((await workout_service.get_workout(session, owner, workout.id)).sets[0].parts) == 3


@pytest.mark.asyncio
async def test_structured_set_is_private_and_operation_payload_immutable(database):
    session, owner, workout = await create_method_workout(database)
    other = database[2]
    parent = workout.sets[0]
    data = WorkoutSetCreate(exercise_id=parent.exercise_id, set_number=1, execution_version=2,
        execution_kind="cluster", base_execution_revision=0, client_operation_id=uuid4(), parts=recorded_parts(parent))
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, other, workout.id, data)
    assert caught.value.status_code == 404
    await workout_service.add_workout_set(session, owner, workout.id, data)
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, owner, workout.id, data.model_copy(update={"note": "другое"}))
    assert caught.value.status_code == 409


@pytest.mark.asyncio
async def test_all_skipped_is_not_completed_and_pending_cannot_be_dropped(database):
    session, owner, workout = await create_method_workout(database)
    parent = workout.sets[0]
    parts = [{**p, "status": "skipped"} for p in recorded_parts(parent)]
    data = WorkoutSetCreate(exercise_id=parent.exercise_id, set_number=1, execution_version=2,
        execution_kind="cluster", base_execution_revision=0, client_operation_id=uuid4(), parts=parts)
    saved = await workout_service.add_workout_set(session, owner, workout.id, data)
    assert not saved.is_completed and all(part.status == "skipped" for part in saved.parts)
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, owner, workout.id, data.model_copy(update={
            "base_execution_revision": 1, "client_operation_id": uuid4(), "parts": data.parts[:2]}))
    assert caught.value.status_code == 422

@pytest.mark.asyncio
async def test_customization_can_define_cluster_and_superset(database):
    from app.services import workout_customization
    from tests.test_workout_customization import request
    session, owner, _, program, extra, base, _ = database
    method = method_plan(base.id)["exercises"][0]["set_methods"][0]
    group = {"id": str(uuid4()), "kind": "superset", "exercise_ids": [str(base.id), str(extra.id)], "rounds": 3}
    await workout_customization.save_customization(session, owner, request(program, patch={
        "added_exercises": [{"exercise_id": extra.id}],
        "exercise_overrides": [{"exercise_id": base.id, "set_methods": [method]}], "groups": [group],
    }))
    plan = await workout_service.build_program_plan_for_user(session, owner, program, day_index=1, scheduled_date=date(2026, 10, 19), week_phase=None)
    assert plan["execution_version"] == 2 and len(plan["groups"]) == 1
    assert len(plan["exercises"][0]["set_methods"][0]["parts"]) == 3
    with pytest.raises(HTTPException) as caught:
        await workout_service.create_workout(session, owner, WorkoutCreate(
            program_id=program.id, scheduled_date=date(2026, 10, 19), day_index=1))
    assert caught.value.status_code == 409
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(
        program_id=program.id, scheduled_date=date(2026, 10, 19), day_index=1, execution_version=2))
    assert workout.plan["groups"][0]["id"] == group["id"]
    assert len(workout.sets) == 6


@pytest.mark.asyncio
async def test_start_rejects_outdated_personal_snapshot(database):
    from app.services import workout_customization
    from tests.test_workout_customization import request
    session, owner, _, program, extra, _, _ = database
    old = await workout_service.build_program_plan_for_user(session, owner, program, day_index=1, scheduled_date=date(2026, 10, 19), week_phase=None)
    await workout_customization.save_customization(session, owner, request(program, extra))
    with pytest.raises(HTTPException) as caught:
        await workout_service.create_workout(session, owner, WorkoutCreate(
            program_id=program.id, day_index=1, scheduled_date=date(2026, 10, 19), plan=old))
    assert caught.value.status_code == 409


@pytest.mark.asyncio
async def test_legacy_sync_dispatch_cannot_project_away_execution(database):
    from app.schemas.android_sync import Operation
    from app.services.android_sync.dispatch import dispatch
    session, owner, workout = await create_method_workout(database)
    parent = workout.sets[0]
    operation = Operation.model_validate({"id": str(uuid4()), "owner": str(owner.id), "createdAt": 1, "kind": "workout", "action": "set",
        "entityId": str(workout.id), "baseRevision": "0", "body": {"exercise_id": str(parent.exercise_id),
        "set_number": 1, "reps": 12, "weight": 100, "is_completed": True}})
    with pytest.raises(HTTPException) as caught:
        await dispatch(session, owner, operation)
    assert caught.value.status_code == 409
    snapshot = await workout_service.get_workout(session, owner, workout.id)
    assert snapshot.sets[0].execution_revision == 0 and len(snapshot.sets[0].parts) == 3

@pytest.mark.asyncio
@pytest.mark.parametrize("kind,weights", [("cluster", [100, 90, 100]), ("drop", [30, 35, 20])])
async def test_recorded_weights_cannot_break_the_method(database, kind, weights):
    session, owner, workout = await create_method_workout(database, kind)
    parent = workout.sets[0]
    parts = [{**part, "weight": weight} for part, weight in zip(recorded_parts(parent), weights)]
    data = WorkoutSetCreate(exercise_id=parent.exercise_id, set_number=1, execution_version=2,
        execution_kind=kind, base_execution_revision=0, client_operation_id=uuid4(), parts=parts)
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, owner, workout.id, data)
    assert caught.value.status_code == 422
    assert parent.execution_revision == 0 and all(part.status == "pending" for part in parent.parts)


@pytest.mark.asyncio
async def test_offline_first_save_assigns_stable_part_ids_once(database):
    session, owner, workout = await create_method_workout(database)
    parent = workout.sets[0]
    parts = [{**part, "id": uuid4()} for part in recorded_parts(parent)]
    data = WorkoutSetCreate(exercise_id=parent.exercise_id, set_number=1, execution_version=2,
        execution_kind="cluster", base_execution_revision=0, client_operation_id=uuid4(), parts=parts)
    result = await workout_service.add_workout_set(session, owner, workout.id, data)
    assert [part.id for part in result.parts] == [part["id"] for part in parts]
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, owner, workout.id, data.model_copy(update={
            "base_execution_revision": 1, "client_operation_id": uuid4(),
            "parts": [part.model_copy(update={"id": uuid4()}) for part in data.parts]}))
    assert caught.value.status_code == 409


@pytest.mark.asyncio
async def test_two_devices_cannot_overwrite_same_revision(database):
    import asyncio
    from sqlalchemy.ext.asyncio import async_sessionmaker
    session, owner, workout = await create_method_workout(database)
    parent = workout.sets[0]
    data = WorkoutSetCreate(exercise_id=parent.exercise_id, set_number=1, execution_version=2,
        execution_kind="cluster", base_execution_revision=0, client_operation_id=uuid4(), parts=recorded_parts(parent))
    await session.commit()
    async with async_sessionmaker(session.bind, expire_on_commit=False)() as first, async_sessionmaker(session.bind, expire_on_commit=False)() as second:
        results = await asyncio.gather(
            workout_service.add_workout_set(first, owner, workout.id, data),
            workout_service.add_workout_set(second, owner, workout.id, data.model_copy(update={"client_operation_id": uuid4()})),
            return_exceptions=True,
        )
    assert sum(isinstance(item, HTTPException) and item.status_code == 409 for item in results) == 1
    assert sum(getattr(item, "execution_revision", None) == 1 for item in results) == 1


@pytest.mark.asyncio
async def test_execution_migration_rolls_back_and_preserves_ordinary_history(database):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    from tests.test_workout_customization import migration
    session, owner, _, _, _, base, _ = database
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(
        scheduled_date=date(2026, 10, 19), exercise_ids=[base.id], sets_per_exercise=1))
    row = await workout_service.add_workout_set(session, owner, workout.id, WorkoutSetCreate(
        exercise_id=base.id, set_number=1, reps=12, weight=50, is_completed=True))
    identity = row.id
    raw = await (await session.connection()).get_raw_connection()
    await raw.driver_connection.execute("DROP TABLE workout_set_execution_receipts; DROP TABLE workout_set_parts; ALTER TABLE workout_sets DROP COLUMN execution_kind, DROP COLUMN execution_revision;")
    sql = migration().with_name("20261019000001_structured_workout_execution.sql").read_text(encoding="utf-8-sig")
    with pytest.raises(DBAPIError):
        async with session.begin_nested():
            await (await (await session.connection()).get_raw_connection()).driver_connection.execute(sql)
            await session.execute(text("SELECT 1 / 0"))
    columns = await session.scalars(text("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='workout_sets'"))
    assert "execution_kind" not in columns.all()
    await (await (await session.connection()).get_raw_connection()).driver_connection.execute(sql)
    saved = (await session.execute(text("SELECT reps, weight, is_completed, execution_kind, execution_revision FROM workout_sets WHERE id=:id"), {"id": identity})).mappings().one()
    assert saved["reps"] == 12 and saved["weight"] == 50 and saved["is_completed"]
    assert saved["execution_kind"] == "standard" and saved["execution_revision"] == 0

@pytest.mark.asyncio
async def test_legacy_preparation_cannot_overwrite_modern_occurrence(database):
    from app.services import planned_workout, workout_customization
    from tests.test_workout_customization import request, base_plan
    session, owner, _, program, extra, base, _ = database
    await workout_customization.save_customization(session, owner, request(program, scope="occurrence", patch={
        "exercise_overrides": [{"exercise_id": base.id, "set_methods": method_plan(base.id)["exercises"][0]["set_methods"]}],
    }))
    with pytest.raises(HTTPException) as caught:
        await planned_workout.save_override(session, user_id=owner.id, program_id=program.id,
            scheduled_date=date(2026, 10, 19), day_index=1, week_phase=None, base_plan=base_plan(base), replacements=[])
    assert caught.value.status_code == 409

@pytest.mark.parametrize("count", [0, 21])
def test_v2_plan_size_is_bounded_without_clipping(count):
    raw = {"execution_version": 2, "exercises": [{"exercise_id": str(uuid4()), "order": i + 1} for i in range(count)]}
    with pytest.raises(ValidationError):
        WorkoutPlan.model_validate(raw)

@pytest.mark.asyncio
async def test_completion_obeys_calendar_lock_order(database):
    import asyncio
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.models.user import User
    session, owner, workout = await create_method_workout(database)
    await session.execute(select(User.id).where(User.id == owner.id).with_for_update())
    async with async_sessionmaker(session.bind, expire_on_commit=False)() as concurrent:
        task = asyncio.create_task(workout_service.complete_workout(concurrent, owner, workout.id, WorkoutCompleteRequest(execution_version=2)))
        try:
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(task), .15)
        finally:
            await session.commit()
            result = await task
        assert result.status == "completed"

@pytest.mark.asyncio
async def test_preparation_rejects_method_on_timed_or_reps_only_exercise(database):
    from app.services import workout_customization
    from tests.test_workout_customization import request
    session, owner, _, program, _, base, _ = database
    base.tags = ["load:timed"]
    await session.commit()
    with pytest.raises(HTTPException) as caught:
        await workout_customization.save_customization(session, owner, request(program, patch={
            "exercise_overrides": [{"exercise_id": base.id, "set_methods": method_plan(base.id)["exercises"][0]["set_methods"]}],
        }))
    assert caught.value.status_code == 422


def test_v2_orders_are_unique_and_bounded():
    raw = method_plan()
    raw["exercises"].append({"exercise_id": str(uuid4()), "order": 1, "target_sets": 1})
    with pytest.raises(ValidationError):
        WorkoutPlan.model_validate(raw)

@pytest.mark.asyncio
async def test_changed_catalog_type_does_not_prevent_opening_and_repairing_personal_method(database):
    from app.services import workout_customization
    from tests.test_workout_customization import request
    session, owner, _, program, _, base, _ = database
    await workout_customization.save_customization(session, owner, request(program, patch={
        "exercise_overrides": [{"exercise_id": base.id, "set_methods": method_plan(base.id)["exercises"][0]["set_methods"]}],
    }))
    base.tags = ["load:timed"]
    await session.commit()
    plan = await workout_service.build_program_plan_for_user(session, owner, program, day_index=1,
        scheduled_date=date(2026, 10, 19), week_phase=None)
    assert plan["exercises"][0]["set_methods"]
    repaired = await workout_customization.save_customization(session, owner, request(program, revision=1, patch={
        "exercise_overrides": [{"exercise_id": base.id, "set_methods": []}],
    }))
    assert repaired.revision == 2
