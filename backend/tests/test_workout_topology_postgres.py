import asyncio
from datetime import date
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.exercise import Exercise
from app.models.user import User
from app.schemas.workout import WorkoutCompleteRequest, WorkoutCreate, WorkoutPlan, WorkoutResponse, WorkoutSetCreate
from app.services import workout_service
from app.services.workout_topology import ActiveTopologyApply, ActiveTopologyRequest
from app.services.workout_topology_apply import apply_topology, preview_topology
from tests.test_workout_customization import database as database


async def start_group(database, *, drop=False, kind="superset"):
    session, owner, other, _, a, b, _ = database
    replacement = Exercise(name_ru="Замена", muscle_group="Пресс", difficulty=1)
    session.add(replacement)
    members = [a, b]
    if kind == "triset":
        third = Exercise(name_ru="Третий участник", muscle_group="Руки", difficulty=1)
        session.add(third)
        members.append(third)
    await session.commit()
    gid = uuid4()
    exercises = [{"exercise_id": ex.id, "order": position, "target_sets": 2}
                 for position, ex in enumerate(members, 1)]
    if drop:
        exercises[0]["set_methods"] = [{"set_number": 1, "kind": "drop", "parts": [
            {"target_reps": 8, "target_weight": 30, "pause_after_sec": 0},
            {"target_reps": 8, "target_weight": 20, "pause_after_sec": 0},
        ]}]
    plan = WorkoutPlan.model_validate({"execution_version": 2, "groups": [
        {"id": gid, "kind": kind, "exercise_ids": [exercise.id for exercise in members], "rounds": 2},
    ], "exercises": exercises})
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(
        scheduled_date=date(2026, 11, 14), client_workout_id=uuid4(), execution_version=2, plan=plan,
    ))
    return session, owner, other, workout, gid, a.id, b.id, replacement.id


def result(exercise, number=1, revision=None):
    return WorkoutSetCreate(exercise_id=exercise, set_number=number, is_completed=True, reps=9,
                            execution_version=2, execution_kind="standard", base_execution_revision=0,
                            active_plan_revision=revision, client_operation_id=uuid4())


async def confirmed(session, owner, workout, request):
    preview = await preview_topology(session, owner, workout, request)
    return ActiveTopologyApply(**request.model_dump(), preview_fingerprint=preview["preview_fingerprint"])


@pytest.mark.asyncio
async def test_replace_untouched_member_replays_and_protects_existing_and_stale_results(database):
    session, owner, other, workout, _, a, b, replacement = await start_group(database)
    workout_id, owner_id, other_id = workout.id, owner.id, other.id
    saved_set = await workout_service.add_workout_set(session, owner, workout_id, result(b))
    request = ActiveTopologyRequest(operation_id=uuid4(), action="replace_member", subject_id=a,
                                    replacement_exercise_id=replacement)
    payload = await confirmed(session, owner, workout_id, request)
    applied = await apply_topology(session, owner, workout_id, payload)
    assert applied.plan["active_plan_revision"] == 1
    assert applied.plan["groups"][0]["exercise_ids"] == [str(replacement), str(b)]
    assert [(row.id, row.reps) for row in applied.sets if row.exercise_id == b and row.is_completed] == [(saved_set.id, 9)]
    assert {row.exercise_id for row in applied.sets} == {replacement, b}
    assert (await apply_topology(session, owner, workout_id, payload)).model_dump() == applied.model_dump()

    rejected = [
        (lambda: apply_topology(session, owner, workout_id, payload.model_copy(update={"target_count": 2})), 409),
        (lambda: apply_topology(session, other, workout_id, payload), 404),
        (lambda: workout_service.add_workout_set(session, owner, workout_id, result(a, 2)), 409),
        (lambda: workout_service.complete_workout(session, owner, workout_id, WorkoutCompleteRequest(execution_version=2)), 409),
    ]
    for invoke, status in rejected:
        with pytest.raises(HTTPException) as caught:
            await invoke()
        assert caught.value.status_code == status
        await session.rollback()
        owner = await session.get(User, owner_id)
        other = await session.get(User, other_id)
    untouched = await workout_service.add_workout_set(session, owner, workout_id, result(b, 2))
    assert untouched.is_completed and untouched.reps == 9
    replay = await apply_topology(session, owner, workout_id, payload)
    assert any(row.id == untouched.id and row.is_completed for row in replay.sets)


@pytest.mark.asyncio
async def test_concurrent_recording_invalidates_confirmed_group_replacement(database):
    session, owner, _, workout, group, a, _, replacement = await start_group(database)
    workout_id, owner_id = workout.id, owner.id
    request = ActiveTopologyRequest(operation_id=uuid4(), action="replace_group", subject_id=group,
                                    replacement_exercise_id=replacement)
    maker = async_sessionmaker(session.bind, expire_on_commit=False)
    payload = await confirmed(session, owner, workout_id, request)
    # The preview transaction holds the row while it derives its fingerprint.
    await session.commit()
    recorded = asyncio.Event()

    async def record():
        async with maker() as other:
            other_owner = await other.get(User, owner_id)
            response = await workout_service.add_workout_set(other, other_owner, workout_id, result(a))
            recorded.set()
            return response.id

    async def apply():
        async with maker() as other:
            other_owner = await other.get(User, owner_id)
            await recorded.wait()
            with pytest.raises(HTTPException) as caught:
                await apply_topology(other, other_owner, workout_id, payload)
            assert caught.value.status_code == 409

    saved, _ = await asyncio.wait_for(asyncio.gather(record(), apply()), timeout=8)
    async with maker() as observer:
        observer_owner = await observer.get(User, owner_id)
        current = await workout_service.get_workout(observer, observer_owner, workout_id)
        assert current.plan.get("active_plan_revision", 0) == 0
        assert any(row.id == saved and row.is_completed for row in current.sets)


@pytest.mark.asyncio
async def test_replaces_the_remaining_round_and_keeps_old_group_results(database):
    session, owner, _, workout, group, a, b, replacement = await start_group(database)
    workout_id = workout.id
    saved = [await workout_service.add_workout_set(session, owner, workout_id, result(exercise)) for exercise in (a, b)]
    request = ActiveTopologyRequest(operation_id=uuid4(), action="replace_group", subject_id=group,
                                    replacement_exercise_id=replacement)
    payload = await confirmed(session, owner, workout_id, request)
    applied = await apply_topology(session, owner, workout_id, payload)
    assert applied.plan["groups"] == []
    assert applied.plan["exercises"][0]["target_sets"] == 1
    assert {row.id for row in applied.sets if row.is_completed} == {row.id for row in saved}
    assert [(row.exercise_id, row.set_number) for row in applied.sets if not row.is_completed] == [(replacement, 1)]
    reopened = WorkoutResponse.model_validate(await workout_service.get_workout(session, owner, workout_id))
    assert {row.id for row in reopened.sets} == {row.id for row in applied.sets}


@pytest.mark.asyncio
async def test_replacing_member_keeps_partial_drop_set_and_original_round_order(database):
    session, owner, _, workout, _, a, b, replacement = await start_group(database, drop=True)
    workout_id = workout.id
    drop = next(row for row in workout.sets if row.exercise_id == a and row.set_number == 1)
    part, pending_part = drop.parts
    recorded = WorkoutSetCreate(
        exercise_id=a, set_number=1, execution_version=2, execution_kind="drop", base_execution_revision=0,
        client_operation_id=uuid4(),
        parts=[
            {"id": part.id, "ordinal": 1, "reps": 8, "weight": 30, "status": "completed", "rest_after_sec": 0},
            {"id": pending_part.id, "ordinal": 2, "status": "pending", "rest_after_sec": 0},
        ],
    )
    saved = await workout_service.add_workout_set(session, owner, workout_id, recorded)
    await workout_service.add_workout_set(session, owner, workout_id, result(a, 2))
    request = ActiveTopologyRequest(operation_id=uuid4(), action="replace_member", subject_id=a,
                                    replacement_exercise_id=replacement, expected_plan_revision=0)
    applied = await apply_topology(session, owner, workout_id, await confirmed(session, owner, workout_id, request))
    assert applied.plan["groups"][0]["exercise_ids"] == [str(replacement), str(b)]
    assert applied.plan["exercises"][0]["active_set_numbers"] == [1]
    assert [row.set_number for row in applied.sets if row.exercise_id == replacement] == [1]
    assert next(row for row in applied.sets if row.id == saved.id).parts == saved.parts
    assert (await workout_service.add_workout_set(session, owner, workout_id, recorded)).id == saved.id
    assert (await workout_service.add_workout_set(session, owner, workout_id, result(replacement, revision=1))).is_completed

    current = await workout_service.complete_workout(session, owner, workout_id, WorkoutCompleteRequest(
        execution_version=2, active_plan_revision=1,
    ))
    assert any(row.id == saved.id and row.parts[0].status == "completed" for row in current.sets)


@pytest.mark.asyncio
async def test_resize_rounds_preserves_completed_rows_and_rejects_removing_recorded_work(database):
    session, owner, _, workout, group, a, b, _ = await start_group(database)
    workout_id, owner_id = workout.id, owner.id
    saved = await workout_service.add_workout_set(session, owner, workout_id, result(a, 2))
    resize = ActiveTopologyRequest(operation_id=uuid4(), action="resize_group", subject_id=group, target_count=1)
    with pytest.raises(HTTPException) as caught:
        await confirmed(session, owner, workout_id, resize)
    assert caught.value.status_code == 409
    await session.rollback()
    owner = await session.get(User, owner_id)
    more = resize.model_copy(update={"target_count": 3, "expected_plan_revision": 0})
    applied = await apply_topology(session, owner, workout_id, await confirmed(session, owner, workout_id, more))
    assert applied.plan["groups"][0]["rounds"] == 3
    assert {row.exercise_id for row in applied.sets if row.set_number == 3} == {a, b}
    assert next(row for row in applied.sets if row.id == saved.id).reps == 9


@pytest.mark.asyncio
async def test_reopened_round_does_not_accept_results_from_before_its_removal(database):
    session, owner, _, workout, group, a, _, _ = await start_group(database)
    workout_id, owner_id = workout.id, owner.id
    for revision, count in enumerate((1, 2)):
        request = ActiveTopologyRequest(operation_id=uuid4(), action="resize_group", subject_id=group,
                                        target_count=count, expected_plan_revision=revision)
        await apply_topology(session, owner, workout_id, await confirmed(session, owner, workout_id, request))
    with pytest.raises(HTTPException) as caught:
        await workout_service.add_workout_set(session, owner, workout_id, result(a, 2))
    assert caught.value.status_code == 409
    await session.rollback()
    owner = await session.get(User, owner_id)
    fresh = result(a, 2, revision=2).model_copy(update={"base_execution_revision": 1})
    assert (await workout_service.add_workout_set(session, owner, workout_id, fresh)).is_completed


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["superset", "triset"])
async def test_appends_exercise_after_the_group_once_without_changing_recorded_sets(database, kind):
    session, owner, _, workout, _, a, _, extra = await start_group(database, kind=kind)
    workout_id = workout.id
    saved = await workout_service.add_workout_set(session, owner, workout_id, result(a))
    original_group = workout.plan["groups"]
    request = ActiveTopologyRequest(operation_id=uuid4(), action="append_exercise", subject_id=extra,
                                    expected_plan_revision=0)
    payload = await confirmed(session, owner, workout_id, request)
    applied = await apply_topology(session, owner, workout_id, payload)
    assert applied.plan["groups"] == original_group
    assert applied.plan["exercises"][-1]["exercise_id"] == str(extra)
    assert applied.plan["exercises"][-1]["target_sets"] == 3
    assert next(row for row in applied.sets if row.id == saved.id).reps == 9
    assert (await apply_topology(session, owner, workout_id, payload)).model_dump() == applied.model_dump()
    assert (await workout_service.add_workout_set(session, owner, workout_id, result(extra, revision=1))).is_completed

    duplicate = ActiveTopologyRequest(operation_id=uuid4(), action="append_exercise", subject_id=extra,
                                      expected_plan_revision=1)
    with pytest.raises(HTTPException) as caught:
        await confirmed(session, owner, workout_id, duplicate)
    assert caught.value.status_code == 409
