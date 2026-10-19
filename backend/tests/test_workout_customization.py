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
    from app.models.user_program_day_override import UserProgramDayOverride
    schema = "workout_test_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE TYPE subscription_status AS ENUM ('free', 'pro_stars')"))
            await conn.execute(text("CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$"))
            tables = [User.__table__, Program.__table__, Exercise.__table__, WorkoutPlanOverride.__table__]
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
