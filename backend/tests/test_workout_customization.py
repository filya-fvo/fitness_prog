"""Personal program deltas: public API and isolated PostgreSQL integration."""
import os
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.main import app


def test_customization_api_has_scope_and_revision_contract():
    path = app.openapi()["paths"].get("/workouts/customizations", {})
    assert set(path) == {"get", "put", "delete"}, "Personal workout customization is missing"


@pytest_asyncio.fixture
async def database():
    url = os.environ.get("WORKOUT_METHODS_TEST_URL")
    if not url:
        pytest.skip("WORKOUT_METHODS_TEST_URL required for isolated PostgreSQL checks")
    from app.core.database import Base
    from app.models.exercise import Exercise
    from app.models.program import Program
    from app.models.user import User
    from app.models.workout_plan_override import WorkoutPlanOverride
    from app.models.workout import Workout, WorkoutSet
    from app.models.user_program_day_override import UserProgramDayOverride
    schema = "workout_test_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE TYPE subscription_status AS ENUM ('free', 'pro_stars')"))
            await conn.execute(text("CREATE TYPE workout_status AS ENUM ('planned', 'completed', 'skipped')"))
            await conn.execute(text("CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$"))
            tables = [User.__table__, Program.__table__, Exercise.__table__, WorkoutPlanOverride.__table__, Workout.__table__, WorkoutSet.__table__]
            await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(migration().read_text(encoding="utf-8"))
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            owner, other = User(), User()
            exercise = Exercise(name_ru="Пресс", muscle_group="Пресс", difficulty=1)
            base = Exercise(name_ru="Бицепс", muscle_group="Руки", difficulty=1)
            program = Program(name="Чередование акцентов", publication_status="published", is_current=True, structure={})
            session.add_all([owner, other, exercise, base, program])
            await session.commit()
            program.structure = {"schedule": [{"day_index": 1, "exercises": [{"exercise_id": str(base.id), "sets": 3}]}]}
            await session.commit()
            yield session, owner, other, program, exercise, base, UserProgramDayOverride
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


def migration():
    return Path(__file__).resolve().parents[2] / "supabase/migrations/20261019000000_personal_workout_customizations.sql"


def request(program, exercise=None, *, revision=0, scope="program_day", patch=None, operation=None):
    from app.schemas.workout_customization import WorkoutCustomizationRequest
    return WorkoutCustomizationRequest(
        program_id=program.id, day_index=1, scope=scope,
        scheduled_date=date(2026, 10, 19) if scope == "occurrence" else None,
        base_revision=revision, operation_id=operation or uuid4(),
        patch=patch if patch is not None else {"added_exercises": [{"exercise_id": exercise.id}]},
    )


def base_plan(base, phase="medium"):
    return {"title": "День 1", "day_index": 1, "week_phase": phase, "exercises": [
        {"exercise_id": str(base.id), "order": 1, "target_sets": 3, "target_reps": "8-12", "rest_sec": 90}
    ]}


async def resolve(service, session, owner, program, base, *, day=1, when=date(2026, 10, 19), phase="medium"):
    return await service.apply_customizations(session, user_id=owner.id, program_id=program.id, day_index=day, scheduled_date=when, base_plan=base_plan(base, phase))


@pytest.mark.asyncio
async def test_personal_day_is_owner_scoped(database):
    from app.services import workout_customization as service
    session, owner, other, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    own = await resolve(service, session, owner, program, base)
    foreign = await resolve(service, session, other, program, base)
    assert [row["exercise_id"] for row in own["exercises"]] == [str(base.id), str(exercise.id)]
    assert foreign == base_plan(base)
    assert len(program.structure["schedule"][0]["exercises"]) == 1 and owner.goals == {}


@pytest.mark.asyncio
async def test_occurrence_wins_without_changing_next_occurrence(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": exercise.id, "target_sets": 5}]}))
    today = await resolve(service, session, owner, program, base)
    later = await resolve(service, session, owner, program, base, when=date(2026, 10, 26))
    other_day = await resolve(service, session, owner, program, base, day=2)
    assert today["exercises"][1]["target_sets"] == 5
    assert later["exercises"][1]["target_sets"] == 3
    assert len(other_day["exercises"]) == 1


@pytest.mark.asyncio
async def test_stale_revision_preserves_both_changes(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, _, model = database
    operation = uuid4()
    saved = await service.save_customization(session, owner, request(program, exercise, operation=operation))
    replay = await service.save_customization(session, owner, request(program, exercise, operation=operation))
    assert saved.revision == replay.revision == 1
    with pytest.raises(HTTPException) as caught:
        await service.save_customization(session, owner, request(program, patch={}))
    assert caught.value.status_code == 409
    row = await session.scalar(select(model).where(model.user_id == owner.id))
    assert row.patch["added_exercises"][0]["exercise_id"] == str(exercise.id)


@pytest.mark.asyncio
async def test_reset_does_not_delete_occurrence_or_history(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "target_sets": 4}]}))
    snapshot = await resolve(service, session, owner, program, base)
    await service.reset_customization(session, owner, request(program, revision=1, patch={}))
    current = await resolve(service, session, owner, program, base)
    assert len(snapshot["exercises"]) == 2
    assert len(current["exercises"]) == 1 and current["exercises"][0]["target_sets"] == 4
    saved = await service.get_customization(session, owner, program_id=program.id, day_index=1, scope="program_day", scheduled_date=None)
    assert saved.revision == 2 and saved.patch.added_exercises == []


@pytest.mark.asyncio
async def test_personal_patch_keeps_automatic_phase_targets(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    targets = []
    for phase in ("light", "medium", "heavy"):
        plan = await resolve(service, session, owner, program, base, phase=phase)
        targets.append(plan["exercises"][1]["target_reps"])
        assert plan["week_phase"] == phase
    assert len(set(targets)) == 3


@pytest.mark.asyncio
async def test_private_program_cannot_be_customized_by_another_owner(database):
    from app.services import workout_customization as service
    session, owner, other, program, exercise, _, _ = database
    program.owner_id = owner.id
    await session.commit()
    with pytest.raises(HTTPException) as caught:
        await service.save_customization(session, other, request(program, exercise))
    assert caught.value.status_code == 404


@pytest.mark.asyncio
async def test_migration_reapplies_without_losing_saved_patch(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, _, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    raw = await (await session.connection()).get_raw_connection()
    await raw.driver_connection.execute(migration().read_text(encoding="utf-8"))
    saved = await service.get_customization(session, owner, program_id=program.id, day_index=1, scope="program_day", scheduled_date=None)
    assert saved.revision == 1 and len(saved.patch.added_exercises) == 1

@pytest.mark.asyncio
async def test_program_preview_and_start_resolver_include_personal_delta(database):
    from app.services import workout_customization as service, workout_service
    session, owner, _, program, exercise, _, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    plan = await workout_service.build_program_plan_for_user(session, owner, program, day_index=1, scheduled_date=date(2026, 10, 19), week_phase="heavy")
    assert plan["exercises"][1]["exercise_id"] == str(exercise.id)
    assert plan["customization_revisions"] == {"program_day": 1}
    assert plan["exercises"][1]["target_reps"] != "8-12"

@pytest.mark.asyncio
async def test_operation_id_cannot_replay_a_different_payload(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, _, _ = database
    operation = uuid4()
    await service.save_customization(session, owner, request(program, exercise, operation=operation))
    with pytest.raises(HTTPException) as caught:
        await service.save_customization(session, owner, request(program, patch={}, operation=operation))
    assert caught.value.status_code == 409


@pytest.mark.asyncio
async def test_zero_rest_is_not_replaced_by_default(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, patch={"added_exercises": [{"exercise_id": exercise.id, "rest_sec": 0}]}))
    plan = await resolve(service, session, owner, program, base)
    assert plan["exercises"][1]["rest_sec"] == 0


@pytest.mark.asyncio
async def test_duplicate_exercise_is_rejected_without_persisting(database):
    from app.services import workout_customization as service
    session, owner, _, program, _, base, model = database
    with pytest.raises(HTTPException) as caught:
        await service.save_customization(session, owner, request(program, base))
    assert caught.value.status_code == 422
    assert await session.scalar(select(model).where(model.user_id == owner.id)) is None

@pytest.mark.asyncio
async def test_explicit_base_preview_excludes_only_date_patch(database):
    import httpx
    from app.core.database import get_db
    from app.deps import get_current_user
    from app.services import workout_customization as service
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "target_sets": 5}]}))
    async def db():
        yield session
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = lambda: owner
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/workouts/planned-plan", params={"program_id": str(program.id), "scheduled_date": "2026-10-19", "day_index": 1, "include_saved_override": "false"})
        assert response.status_code == 200
        assert response.json()["exercises"][0]["target_sets"] == 3
        assert len(response.json()["exercises"]) == 2
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_modern_occurrence_atomically_adopts_legacy_replacement(database):
    from app.models.workout_plan_override import WorkoutPlanOverride
    from app.services import workout_customization as service, workout_service
    session, owner, _, program, exercise, base, _ = database
    session.add(WorkoutPlanOverride(user_id=owner.id, program_id=program.id, day_index=1, scheduled_date=date(2026, 10, 19), replacements=[{"from_exercise_id": str(base.id), "to_exercise_id": str(exercise.id)}]))
    await session.commit()
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "replacement_exercise_id": exercise.id}]}))
    plan = await workout_service.build_program_plan_for_user(session, owner, program, day_index=1, scheduled_date=date(2026, 10, 19), week_phase="medium")
    assert plan["exercises"][0]["exercise_id"] == str(exercise.id)
    assert await session.scalar(select(WorkoutPlanOverride).where(WorkoutPlanOverride.user_id == owner.id)) is None

@pytest.mark.asyncio
async def test_start_customized_program_creates_added_slots_once(database):
    from app.models.workout import WorkoutSet
    from app.schemas.workout import WorkoutCreate
    from app.services import workout_customization as service, workout_service
    session, owner, _, program, exercise, _, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    payload = WorkoutCreate(program_id=program.id, scheduled_date=date(2026, 10, 19), day_index=1, client_workout_id=uuid4())
    first = await workout_service.create_workout(session, owner, payload)
    replay = await workout_service.create_workout(session, owner, payload)
    rows = (await session.scalars(select(WorkoutSet).where(WorkoutSet.workout_id == first.id))).all()
    assert first.id == replay.id
    assert len(rows) == 6
    assert len([row for row in rows if row.exercise_id == exercise.id]) == 3

@pytest.mark.asyncio
async def test_raw_program_preview_can_exclude_personal_and_date_layers(database):
    import httpx
    from app.core.database import get_db
    from app.deps import get_current_user
    from app.services import workout_customization as service
    session, owner, _, program, exercise, _, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    async def db():
        yield session
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = lambda: owner
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/workouts/planned-plan", params={"program_id": str(program.id), "scheduled_date": "2026-10-19", "day_index": 1, "include_saved_override": "false", "include_personal_override": "false"})
        assert response.status_code == 200
        assert len(response.json()["exercises"]) == 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_promotes_only_selected_occurrence_and_keeps_future_personal_day(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise, scope="occurrence"))
    permanent = request(program, exercise).model_copy(update={"promote_date": date(2026, 10, 19), "base_occurrence_revision": 1})
    await service.save_customization(session, owner, permanent)
    current = await resolve(service, session, owner, program, base)
    later = await resolve(service, session, owner, program, base, when=date(2026, 10, 26))
    occurrence = await service.get_customization(session, owner, program_id=program.id, day_index=1, scope="occurrence", scheduled_date=date(2026, 10, 19))
    assert len(current["exercises"]) == len(later["exercises"]) == 2
    assert occurrence.revision == 2 and occurrence.patch.added_exercises == []


@pytest.mark.asyncio
async def test_stale_inherited_revision_cannot_overwrite_new_personal_day(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, _, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    stale = request(program, scope="occurrence", patch={}).model_copy(update={"base_program_day_revision": 0})
    with pytest.raises(HTTPException) as caught:
        await service.save_customization(session, owner, stale)
    assert caught.value.status_code == 409


@pytest.mark.asyncio
async def test_reset_with_dependent_occurrence_preserves_both_layers_on_conflict(database):
    from app.services import workout_customization as service
    session, owner, _, program, exercise, _, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": exercise.id, "target_sets": 5}]}))
    with pytest.raises(HTTPException) as caught:
        await service.reset_customization(session, owner, request(program, revision=1, patch={}))
    assert caught.value.status_code == 409
    stored = await service.get_customization(session, owner, program_id=program.id, day_index=1, scope="program_day", scheduled_date=None)
    assert stored.revision == 1 and len(stored.patch.added_exercises) == 1

@pytest.mark.asyncio
async def test_one_off_move_transfers_only_date_layer(database):
    from app.services import workout_customization as service, workout_reschedule
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "target_sets": 5}]}))
    await workout_reschedule._move_pending_occurrence(session, owner.id, date(2026, 10, 19), date(2026, 10, 20))
    await session.commit()
    moved = await resolve(service, session, owner, program, base, when=date(2026, 10, 20))
    original = await resolve(service, session, owner, program, base)
    assert moved["exercises"][0]["target_sets"] == 5
    assert original["exercises"][0]["target_sets"] == 3
    assert len(original["exercises"]) == len(moved["exercises"]) == 2


@pytest.mark.asyncio
async def test_cancel_existing_does_not_delete_permanent_layer(database):
    from app.services import workout_customization as service, workout_reschedule
    session, owner, _, program, exercise, base, _ = database
    await service.save_customization(session, owner, request(program, exercise))
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "target_sets": 5}]}))
    await workout_reschedule._cancel_pending_occurrence(session, owner.id, date(2026, 10, 19))
    await session.commit()
    current = await resolve(service, session, owner, program, base)
    assert len(current["exercises"]) == 2
    assert current["exercises"][0]["target_sets"] == 3

@pytest.mark.asyncio
async def test_four_day_rotation_and_cursor_stay_unchanged(database):
    from copy import deepcopy
    from app.services import workout_customization as service, workout_service
    session, owner, other, program, exercise, base, _ = database
    program.structure = {"schedule": [{"day_index": day, "name": f"Акцент {day}", "exercises": [{"exercise_id": str(base.id), "sets": 3}]} for day in range(1, 5)]}
    owner.goals = {"active_program_id": str(program.id), "active_program_next_day": 3, "active_program_week_phase": "heavy", "active_program_started_at": "2026-10-01"}
    await session.commit()
    goals, structure = deepcopy(owner.goals), deepcopy(program.structure)
    await service.save_customization(session, owner, request(program, exercise))
    for day in range(1, 5):
        plan = await workout_service.build_program_plan_for_user(session, owner, program, day_index=day, scheduled_date=date(2026, 10, 26), week_phase="heavy")
        assert len(plan["exercises"]) == (2 if day == 1 else 1)
        assert plan["week_phase"] == "heavy"
    assert owner.goals == goals and program.structure == structure
    foreign = await resolve(service, session, other, program, base)
    assert len(foreign["exercises"]) == 1


@pytest.mark.asyncio
async def test_personal_changes_do_not_leak_to_new_program_version(database):
    from copy import deepcopy
    from app.models.program import Program
    from app.services import workout_customization as service
    session, owner, _, program, exercise, base, _ = database
    owner.goals = {"active_program_id": str(program.id)}
    program.is_current = False
    newer = Program(name=program.name, program_key=program.program_key, version=2, is_current=True, publication_status="published", structure=deepcopy(program.structure))
    session.add(newer)
    await session.commit()
    await service.save_customization(session, owner, request(program, exercise))
    owner.goals = {"active_program_id": str(newer.id)}
    await session.commit()
    fresh = await resolve(service, session, owner, newer, base)
    assert len(fresh["exercises"]) == 1
    owner.goals = {"active_program_id": str(program.id)}
    await session.commit()
    returned = await resolve(service, session, owner, program, base)
    assert len(returned["exercises"]) == 2

@pytest.mark.asyncio
async def test_repeated_reschedule_and_return_to_default_keep_preparation(database, monkeypatch):
    from datetime import datetime, time, timezone
    from unittest.mock import AsyncMock
    from app.services import workout_customization as service, workout_reschedule, supplement_intakes
    session, owner, _, program, _, base, _ = database
    owner.goals = {"active_program_id": str(program.id), "active_program_next_day": 1, "active_program_week_phase": "medium", "active_program_started_at": "2026-10-19", "workout_schedule": {"version": 1, "days": [0, 2, 4], "start_time": "08:00"}}
    await session.commit()
    monkeypatch.setattr(supplement_intakes, "reset_pending_days", AsyncMock())
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "target_sets": 5}]}))
    for target in (date(2026, 10, 20), date(2026, 10, 22), date(2026, 10, 19)):
        await workout_reschedule.reschedule_workout_occurrence(session, owner, original_date=date(2026, 10, 19), target_date=target, target_time=time(8), now=datetime(2026, 10, 19, 4, tzinfo=timezone.utc))
        plan = await resolve(service, session, owner, program, base, when=target)
        assert plan["exercises"][0]["target_sets"] == 5
    assert owner.goals["workout_schedule"]["days"] == [0, 2, 4]
    assert owner.goals["workout_schedule_overrides"] == []


@pytest.mark.asyncio
async def test_move_conflict_preserves_both_date_preparations(database):
    from app.services import workout_customization as service, workout_reschedule
    session, owner, _, program, _, base, _ = database
    await service.save_customization(session, owner, request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "target_sets": 5}]}))
    target = request(program, scope="occurrence", patch={"exercise_overrides": [{"exercise_id": base.id, "target_sets": 6}]}).model_copy(update={"scheduled_date": date(2026, 10, 20)})
    await service.save_customization(session, owner, target)
    with pytest.raises(HTTPException) as caught:
        await workout_reschedule._move_pending_occurrence(session, owner.id, date(2026, 10, 19), date(2026, 10, 20))
    assert caught.value.status_code == 409
    assert (await resolve(service, session, owner, program, base))["exercises"][0]["target_sets"] == 5
    assert (await resolve(service, session, owner, program, base, when=date(2026, 10, 20)))["exercises"][0]["target_sets"] == 6

@pytest.mark.asyncio
async def test_cancelled_legacy_target_does_not_block_a_move(database):
    from app.models.workout_plan_override import WorkoutPlanOverride
    from app.services import workout_reschedule
    session, owner, _, program, exercise, base, _ = database
    for day in (date(2026, 10, 19), date(2026, 10, 20)):
        session.add(WorkoutPlanOverride(user_id=owner.id, program_id=program.id, day_index=1, scheduled_date=day, replacements=[{"from_exercise_id": str(base.id), "to_exercise_id": str(exercise.id)}]))
    await session.commit()
    await workout_reschedule._cancel_pending_occurrence(session, owner.id, date(2026, 10, 20))
    await workout_reschedule._move_pending_occurrence(session, owner.id, date(2026, 10, 19), date(2026, 10, 20))
    await session.commit()
    rows = (await session.scalars(select(WorkoutPlanOverride).where(WorkoutPlanOverride.user_id == owner.id, WorkoutPlanOverride.is_deleted.is_(False)))).all()
    assert len(rows) == 1 and rows[0].scheduled_date == date(2026, 10, 20)
