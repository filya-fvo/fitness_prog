"""Prepared web starts bind owner, private revisions, program and calendar."""
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from app.models.exercise import Exercise
from app.models.user import User
from app.models.workout import Workout
from app.schemas.program import PersonalProgramCreate, ProgramResponse
from app.schemas.workout import WorkoutCreate, WorkoutPlan, WorkoutSetCreate
from app.services import program_service, workout_service, workout_customization
from app.services.offline_schedule import schedule_fingerprint
from tests.test_workout_customization import database as database, request
from tests.test_offline_workouts import scenario as scenario


@pytest.mark.asyncio
async def test_private_program_goals_survive_database_reload_and_prepared_execution(database):
    from app.services.workout_preparation import plan_fingerprint

    session, owner, other, _, _, _, _ = database
    catalog = [Exercise(name_ru=name, muscle_group="Руки", difficulty=1, tags=[f"load:{load}"])
               for name, load in [("Жим с целью", "weight_reps"), ("Жим без веса цели", "weight_reps"),
                                  ("Отжимания", "reps_only"), ("Планка", "timed")]]
    session.add_all(catalog)
    await session.commit()
    weighted_id, optional_id, reps_id, timed_id = [row.id for row in catalog]
    group = {"id": str(uuid4()), "kind": "superset", "rounds": 2,
             "exercise_ids": [str(weighted_id), str(optional_id)],
             "transition_sec": 0, "round_rest_sec": 0}
    method = {"set_number": 2, "kind": "cluster", "parts": [
        {"target_reps": 6, "target_weight": "40.00", "pause_after_sec": 10},
        {"target_reps": 4, "target_weight": "40.00", "pause_after_sec": 0},
    ]}
    targets = [
        {"kind": "weight_reps", "reps_min": 6, "reps_max": 8, "target_weight": "40.00"},
        {"kind": "weight_reps", "reps_min": 8, "reps_max": 10, "target_weight": None},
        {"kind": "reps_only", "reps_min": 11, "reps_max": 11},
        {"kind": "timed", "duration_sec": 95},
    ]
    data = PersonalProgramCreate.model_validate({
        "name": "Личный структурированный план", "location": "home", "progression": "linear",
        "days": [{"name": "День целей", "groups": [group], "exercises": [
            {"exercise_id": weighted_id, "sets": 2, "reps": "6-8", "rest_sec": 0,
             "target": targets[0], "weight_mode": "per_hand", "set_methods": [method]},
            {"exercise_id": optional_id, "sets": 2, "reps": "8-10", "rest_sec": 0,
             "target": targets[1], "weight_mode": "total"},
            {"exercise_id": reps_id, "sets": 1, "reps": "11", "rest_sec": 0, "target": targets[2]},
            {"exercise_id": timed_id, "sets": 1, "reps": "95с", "rest_sec": 0, "target": targets[3]},
        ]}],
    })
    created_program = await program_service.create_personal_program(session, user_id=owner.id, data=data)
    program_id, owner_id, other_id = created_program.id, owner.id, other.id
    owner.goals = {"active_program_id": str(program_id)}
    # A forged active-program preference must not grant another owner access.
    other.goals = {"active_program_id": str(program_id)}
    await session.commit()
    sessions = async_sessionmaker(session.bind, expire_on_commit=False)
    when = date(2026, 10, 19)

    # This session has never seen the create-service ORM identities or JSON object.
    async with sessions() as read:
        reader = await read.get(User, owner_id)
        program = await program_service.get_program(read, program_id, user_id=reader.id)
        assert reader is not owner and program is not created_program
        assert program.owner_id == owner_id and not program.is_template
        assert program.structure is not created_program.structure
        stored = ProgramResponse.model_validate(program).model_dump(mode="json")["structure"]
        day = stored["schedule"][0]
        assert stored["progression"] == "linear"
        assert day["groups"] == [group]
        assert [row["target"] for row in day["exercises"]] == targets
        assert day["exercises"][0]["set_methods"] == [method]
        assert [row["rest_sec"] for row in day["exercises"]] == [0, 0, 0, 0]
        assert all(type(row[field]) is int for row in day["exercises"] for field in ("sets", "rest_sec"))
        assert all(type(day["groups"][0][field]) is int
                   for field in ("rounds", "transition_sec", "round_rest_sec"))
        assert [row.get("weight_mode") for row in day["exercises"]] == ["per_hand", "total", None, None]
        plan = WorkoutPlan.model_validate(await workout_service.build_program_plan_for_user(
            read, reader, program, day_index=1, scheduled_date=when, week_phase="heavy",
            consume_saved_override=False,
        ))
        assert plan.execution_version == 2 and plan.week_label == "Линейный план"
        assert plan.model_dump(mode="json")["groups"] == [group]
        assert [row.target.model_dump(mode="json") for row in plan.exercises] == targets
        assert [row.target_reps for row in plan.exercises] == ["6-8", "8-10", "11", "95с"]
        assert [row.target_sets for row in plan.exercises] == [2, 2, 1, 1]
        assert [row.rest_sec for row in plan.exercises] == [0, 0, 0, 0]
        assert [row.weight_mode for row in plan.exercises] == ["per_hand", "total", None, None]
        assert plan.exercises[0].set_methods[0].model_dump(mode="json") == method
        assert all(row.suggested_weight is None for row in plan.exercises)
        fingerprint = plan_fingerprint(reader, program, plan, scheduled_date=when, day_index=1,
                                       week_phase="heavy", cycle_readiness=None)
        payload = WorkoutCreate(
            program_id=program_id, client_workout_id=uuid4(), day_index=1, scheduled_date=when,
            week_phase="heavy", execution_version=2, plan=plan,
            preparation={"prepared_at": datetime.now(UTC),
                         "schedule_fingerprint": schedule_fingerprint(reader.goals),
                         "plan_fingerprint": fingerprint},
        )

    async with sessions() as foreign:
        outsider = await foreign.get(User, other_id)
        foreign_goals = dict(outsider.goals)
        assert await program_service.get_program(
            foreign, program_id, active_program_id=program_id, user_id=outsider.id,
        ) is None
        with pytest.raises(HTTPException) as preview_denied:
            await workout_service.preview_program_plan(foreign, outsider, program_id=program_id,
                day_index=1, scheduled_date=when, week_phase="heavy")
        assert preview_denied.value.status_code == 404
        with pytest.raises(HTTPException) as start_denied:
            await workout_service.create_workout(foreign, outsider, payload)
        assert start_denied.value.status_code == 404
        assert not (await foreign.scalars(select(Workout))).all()
        assert outsider.goals == foreign_goals
        assert not foreign.new and not foreign.dirty and not foreign.deleted

    async with sessions() as start:
        starter = await start.get(User, owner_id)
        workout = await workout_service.create_workout(start, starter, payload)
        workout_id = workout.id
        snapshot = WorkoutPlan.model_validate(workout.plan).model_dump(mode="json")
        assert snapshot == plan.model_dump(mode="json")
        assert len(workout.sets) == 6
        for row in workout.sets:
            assert row.reps is None and row.weight is None and row.duration_sec is None
            assert not row.is_completed and row.execution_revision == 0
            assert row.rest_time_sec == 0
            for part in row.parts:
                assert part.reps is None and part.weight is None and part.duration_sec is None
                assert part.status == "pending"
        parent = next(row for row in workout.sets if row.execution_kind == "cluster")
        assert [part.rest_after_sec for part in parent.parts] == [10, 0]

    # Continue from a new database read, then save facts that differ from every goal.
    async with sessions() as record:
        recorder = await record.get(User, owner_id)
        resumed = await workout_service.get_workout(record, recorder, workout_id)
        assert resumed is not workout
        for exercise_id, facts in [(weighted_id, {"reps": 5, "weight": Decimal("37.50"), "weight_mode": "per_hand"}),
                                   (reps_id, {"reps": 9}), (timed_id, {"duration_sec": 80})]:
            await workout_service.add_workout_set(record, recorder, workout_id, WorkoutSetCreate(
                exercise_id=exercise_id, set_number=1, execution_version=2,
                base_execution_revision=0, client_operation_id=uuid4(), is_completed=True,
                rest_time_sec=0, **facts,
            ))
        parent = next(row for row in resumed.sets if row.execution_kind == "cluster")
        part_ids = [part.id for part in parent.parts]
        await workout_service.add_workout_set(record, recorder, workout_id, WorkoutSetCreate(
            exercise_id=weighted_id, set_number=2, execution_version=2, execution_kind="cluster",
            base_execution_revision=0, client_operation_id=uuid4(), weight_mode="per_hand",
            rest_time_sec=0, parts=[
                {"id": part.id, "ordinal": part.ordinal, "reps": reps, "weight": Decimal("35.00"),
                 "status": "completed", "rest_after_sec": part.rest_after_sec}
                for part, reps in zip(parent.parts, [3, 2])
            ],
        ))

    async with sessions() as reload:
        reloaded_owner = await reload.get(User, owner_id)
        reopened = await workout_service.get_workout(reload, reloaded_owner, workout_id)
        assert reopened is not resumed and reloaded_owner is not recorder
        assert reopened.program_id == program_id and reopened.user_id == owner_id
        assert WorkoutPlan.model_validate(reopened.plan).model_dump(mode="json") == snapshot
        slots = {(row.exercise_id, row.set_number): row for row in reopened.sets}
        actual = slots[weighted_id, 1]
        assert (actual.reps, actual.weight, actual.weight_mode) == (5, Decimal("37.50"), "per_hand")
        assert slots[reps_id, 1].reps == 9 and slots[timed_id, 1].duration_sec == 80
        cluster = slots[weighted_id, 2]
        assert cluster.reps is None and cluster.weight is None and cluster.is_completed
        assert [part.id for part in cluster.parts] == part_ids
        assert [part.reps for part in cluster.parts] == [3, 2]
        assert [part.weight for part in cluster.parts] == [Decimal("35.00"), Decimal("35.00")]
        assert [part.rest_after_sec for part in cluster.parts] == [10, 0]
        assert all(part.status == "completed" for part in cluster.parts)
        assert all(slots[key].execution_revision == 1 and slots[key].is_completed
                   for key in [(weighted_id, 1), (weighted_id, 2), (reps_id, 1), (timed_id, 1)])
        assert slots[optional_id, 1].weight is None and not slots[optional_id, 1].is_completed
        program = await program_service.get_program(reload, program_id, user_id=owner_id)
        assert program.structure == stored
        assert plan_fingerprint(reloaded_owner, program, reopened.plan, scheduled_date=when,
                                day_index=1, week_phase="heavy", cycle_readiness=None) == fingerprint


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["private", "calendar", "program", "tamper", "none"])
async def test_prepared_web_start_guards_and_replay(database, change):
    from app.services.workout_preparation import plan_fingerprint
    session, owner, _, program, extra, base, _ = database
    owner.goals = {"active_program_id": str(program.id)}
    await session.commit()
    when = date(2026, 10, 19)
    plan = WorkoutPlan.model_validate(await workout_service.build_program_plan_for_user(session, owner, program,
        day_index=1, scheduled_date=when, week_phase="medium", consume_saved_override=False))
    fingerprint = plan_fingerprint(owner, program, plan, scheduled_date=when, day_index=1, week_phase="medium", cycle_readiness=None)
    stamp = {"prepared_at": datetime.now(UTC), "schedule_fingerprint": schedule_fingerprint(owner.goals), "plan_fingerprint": fingerprint}
    if change == "private":
        await workout_customization.save_customization(session, owner, request(program, extra))
    elif change == "calendar":
        owner.goals = {**owner.goals, "workout_schedule_overrides": [{"original_date": "2026-10-19", "target_date": "2026-10-20", "target_time": "10:00"}]}
        await session.commit()
    elif change == "program":
        program.version += 1
        await session.commit()
    elif change == "tamper":
        plan.exercises[0].rest_sec += 1
    payload = WorkoutCreate.model_validate({"program_id": program.id, "client_workout_id": uuid4(), "day_index": 1,
        "scheduled_date": when, "week_phase": "medium", "execution_version": 2, "plan": plan, "preparation": stamp})
    if change != "none":
        with pytest.raises(HTTPException) as caught:
            await workout_service.create_workout(session, owner, payload)
        assert caught.value.status_code == 409
        assert not (await session.scalars(select(Workout))).all()
    else:
        created = await workout_service.create_workout(session, owner, payload)
        # A later change must not turn an acknowledged same-ID replay into a conflict.
        program.version += 1
        await session.commit()
        assert (await workout_service.create_workout(session, owner, payload)).id == created.id


@pytest.mark.asyncio
async def test_offline_context_does_not_give_complex_plan_to_old_client(monkeypatch, scenario):
    from unittest.mock import AsyncMock
    from app.services import offline_workouts
    from tests.test_workout_execution import method_plan
    user, _, builder = scenario
    builder.side_effect = None
    builder.return_value = method_plan()
    with pytest.raises(HTTPException) as caught:
        await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1)
    assert caught.value.status_code == 409
    result = await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1, execution_version=2)
    assert all(row.preparation_fingerprint for row in result.plans)



@pytest.mark.asyncio
async def test_preparation_keeps_six_mib_bound_and_accepts_explicit_short_range(scenario):
    from unittest.mock import AsyncMock
    from app.services import offline_workouts
    user, _, builder = scenario
    user.goals.update(cycle_training_enabled=True, workout_illness_recovery={"choice_pending": False, "light_cycle_active": True})
    builder.side_effect = None
    builder.return_value = {"exercises": [{"exercise_id": str(uuid4()), "order": i + 1, "note": "x" * 500} for i in range(20)]}
    with pytest.raises(HTTPException) as caught:
        await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=14, execution_version=2)
    assert caught.value.status_code == 413
    short = await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1, execution_version=2)
    assert len(short.days) == 1 and all(len(row.plan.exercises) == 20 for row in short.plans)


def test_fingerprint_is_semantic_and_owner_scoped():
    from types import SimpleNamespace
    from app.services.workout_preparation import plan_fingerprint
    from tests.test_workout_execution import method_plan
    owner, program = SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4(), version=1)
    plan = WorkoutPlan.model_validate(method_plan())
    kwargs = {"scheduled_date": date(2026, 10, 19), "day_index": 1, "week_phase": "medium", "cycle_readiness": "normal"}
    first = plan_fingerprint(owner, program, plan, **kwargs)
    from decimal import Decimal
    for part in plan.exercises[0].set_methods[0].parts:
        part.target_weight = Decimal("100.00")
    plan.exercises[0].suggested_weight = Decimal("90")
    assert plan_fingerprint(owner, program, plan, **kwargs) == first
    assert plan_fingerprint(SimpleNamespace(id=uuid4()), program, plan, **kwargs) != first
    plan.customization_revisions = {"program_day": 1}
    assert plan_fingerprint(owner, program, plan, **kwargs) != first

@pytest.mark.asyncio
async def test_capable_bundle_carries_canonical_added_exercise_defaults(scenario):
    from unittest.mock import AsyncMock
    from app.services import offline_workouts
    user, _, _ = scenario
    result = await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1, execution_version=2)
    for row in result.plans:
        defaults = row.model_dump().get("exercise_defaults")
        assert defaults == {"target_reps": {"light": "12-15", "medium": "8-10", "heavy": "5-8"}[row.week_phase], "rest_sec": 90 if row.week_phase == "heavy" else 60}
