"""Concurrent program starts against an isolated PostgreSQL schema."""

import asyncio
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import Base
from app.models.user import User
from app.models.workout import Workout
from app.schemas.android_sync import Operation
from app.schemas.workout import WorkoutCreate
from app.services import workout_service
from app.services.android_sync import service as android_sync
from app.services.android_sync.prepared_start import canonical_prepared_start
from tests.test_workout_customization import database as database


@pytest.mark.asyncio
@pytest.mark.parametrize("second_offline", [False, True], ids=["online-online", "online-offline"])
async def test_two_starts_cannot_create_two_workouts_for_one_program_date(database, second_offline):
    session, owner, _, program, *_ = database
    owner_id, program_id = owner.id, program.id
    owner.goals = {"active_program_id": str(program_id), "active_program_next_day": 1}
    await session.commit()

    day = date(2026, 10, 19)
    factory = async_sessionmaker(session.bind, expire_on_commit=False)

    async def start(pid_ready, *, offline=False):
        async with factory() as client:
            user = await client.get(User, owner_id)
            pid_ready.set_result(await client.scalar(text("select pg_backend_pid()")))
            if offline:
                with pytest.raises(HTTPException) as error:
                    await workout_service.create_workout(
                        client, user, WorkoutCreate(
                            client_workout_id=uuid4(), program_id=program_id,
                            scheduled_date=day, day_index=1, week_phase="medium",
                        ),
                    )
                assert error.value.status_code == 409
                assert "Результат сохранён на устройстве" in error.value.detail
                return None
            workout = await workout_service.start_program_workout(
                client, user, program_id, day_index=1, scheduled_date=day, week_phase="medium",
            )
            return workout.id

    async def wait_for_lock(pid):
        async with factory() as observer:
            while True:
                waiting = await observer.scalar(text(
                    "select cardinality(pg_blocking_pids(:pid)) > 0"
                ), {"pid": pid})
                if waiting:
                    return
                await asyncio.sleep(0.01)

    async with factory() as holder, asyncio.TaskGroup() as clients:
        await holder.execute(select(User.id).where(User.id == owner_id).with_for_update())
        try:
            first_pid = asyncio.get_running_loop().create_future()
            first = clients.create_task(start(first_pid))
            await asyncio.wait_for(wait_for_lock(await asyncio.wait_for(first_pid, timeout=5)), timeout=5)
            second_pid = asyncio.get_running_loop().create_future()
            second = clients.create_task(start(second_pid, offline=second_offline))
            await asyncio.wait_for(wait_for_lock(await asyncio.wait_for(second_pid, timeout=5)), timeout=5)
        finally:
            await holder.rollback()

    if not second_offline:
        assert first.result() == second.result()
    stored = (await session.scalars(select(Workout.id).where(
        Workout.user_id == owner_id,
        Workout.program_id == program_id,
        Workout.scheduled_date == day,
        Workout.is_deleted.is_(False),
    ))).all()
    assert stored == [first.result()]


@pytest.mark.asyncio
async def test_online_start_reuses_a_deferred_start_and_offline_retry_keeps_its_id(database):
    session, owner, _, program, *_ = database
    owner.goals = {"active_program_id": str(program.id), "active_program_next_day": 1}
    await session.commit()
    payload = WorkoutCreate(
        client_workout_id=uuid4(), program_id=program.id,
        scheduled_date=date(2026, 10, 19), day_index=1, week_phase="medium",
    )
    created = await workout_service.create_workout(session, owner, payload)
    online = await workout_service.start_program_workout(
        session, owner, program.id, day_index=1, scheduled_date=payload.scheduled_date,
        week_phase="medium",
    )
    replay = await workout_service.create_workout(session, owner, payload)
    assert created.id == online.id == replay.id


@pytest.mark.asyncio
async def test_legacy_create_without_client_id_cannot_duplicate_a_program_workout(database):
    session, owner, _, program, *_ = database
    day = date(2026, 10, 19)
    online = await workout_service.start_program_workout(
        session, owner, program.id, day_index=1, scheduled_date=day, week_phase="medium",
    )
    with pytest.raises(HTTPException) as error:
        await workout_service.create_workout(
            session, owner, WorkoutCreate(program_id=program.id, scheduled_date=day, day_index=1),
        )
    assert error.value.status_code == 409
    manual = await workout_service.create_workout(session, owner, WorkoutCreate(scheduled_date=day))
    assert online.id != manual.id and manual.program_id is None
    assert (await session.scalars(select(Workout.id).where(Workout.program_id == program.id))).all() == [online.id]


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy", [False, True], ids=["current-apk", "legacy-apk"])
async def test_android_push_conflict_does_not_write_receipt_or_second_workout(database, legacy):
    session, owner, _, program, _, exercise, _ = database
    async with session.bind.begin() as connection:
        for table in Base.metadata.tables.values():
            for column in table.columns:
                enum = column.type
                if isinstance(enum, ENUM):
                    await connection.run_sync(lambda conn: enum.create(conn, checkfirst=True))
        await connection.run_sync(Base.metadata.create_all)
        migration = Path(__file__).resolve().parents[2] / "supabase/migrations/20261008000053_android_sync.sql"
        raw = await connection.get_raw_connection()
        await raw.driver_connection.execute(migration.read_text(encoding="utf8"))
    owner.goals = {"active_program_id": str(program.id), "active_program_next_day": 1}
    await session.commit()
    day = date(2026, 10, 19)
    online = await workout_service.start_program_workout(
        session, owner, program.id, day_index=1, scheduled_date=day, week_phase="medium",
    )
    live_id = online.id
    body = {
        "program_id": str(program.id), "scheduled_date": day.isoformat(), "day_index": 1,
        "plan": {"day_index": 1, "exercises": [{
            "exercise_id": str(exercise.id), "order": 1, "target_sets": 3,
        }]},
    }
    if legacy:
        body.update(offline_prepared_at="2026-10-19T08:00:00Z", offline_schedule_fingerprint="0" * 64)
    with pytest.raises(HTTPException) as error:
        await android_sync.push(session.bind, owner.id, Operation(
            id=uuid4(), owner=owner.id, kind="workout", entityId=str(uuid4()), action="create",
            body=body, baseRevision=None, createdAt=1,
        ))
    # The shipped APK retains 422 operations locally and continues unrelated sync.
    assert error.value.status_code == 422
    assert "уже есть" in error.value.detail
    assert (await session.scalars(select(Workout.id))).all() == [live_id]
    assert await session.scalar(text("select count(*) from android_sync_receipts")) == 0


@pytest.mark.asyncio
async def test_legacy_replay_uses_matching_id_even_with_historical_duplicate(database):
    session, owner, _, program, _, exercise, _ = database
    day = date(2026, 10, 19)
    payload = WorkoutCreate.model_validate({
        "client_workout_id": uuid4(), "program_id": program.id, "scheduled_date": day, "day_index": 1,
        "plan": {"exercises": [{"exercise_id": exercise.id, "order": 1, "target_sets": 3}]},
    })
    # Older releases can have already created both rows.
    session.add(Workout(user_id=owner.id, program_id=program.id, scheduled_date=day))
    await session.commit()
    replayed = Workout(
        user_id=owner.id, program_id=program.id, scheduled_date=day,
        client_workout_id=payload.client_workout_id,
    )
    session.add(replayed)
    await session.commit()
    normalized = await canonical_prepared_start(session, owner, payload, {
        "offline_prepared_at": "2026-10-19T08:00:00Z", "offline_schedule_fingerprint": "0" * 64,
    })
    assert (await workout_service.create_workout(session, owner, normalized)).id == replayed.id
