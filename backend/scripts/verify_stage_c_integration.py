"""Run destructive Stage C checks only against the ephemeral CI Compose stack."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import UTC, date, datetime
import os
from urllib.parse import urlsplit
import uuid


class ExpectedRollback(RuntimeError):
    """Sentinel used to prove that a real database transaction rolls back."""


def validate_environment(environ: Mapping[str, str]) -> tuple[str, str]:
    """Reject every environment except the explicit ephemeral CI Compose stack."""
    if environ.get("CI", "").lower() != "true":
        raise RuntimeError("Stage C integration checks require CI=true")
    if environ.get("QA_STAGE_C_INTEGRATION") != "1":
        raise RuntimeError("Stage C integration checks require QA_STAGE_C_INTEGRATION=1")
    if environ.get("ENVIRONMENT") != "test":
        raise RuntimeError("Stage C integration checks require ENVIRONMENT=test")

    database_url = environ.get("DATABASE_URL", "")
    redis_url = environ.get("REDIS_URL", "")
    database = urlsplit(database_url)
    redis = urlsplit(redis_url)
    if database.scheme != "postgresql+asyncpg" or database.hostname != "db":
        raise RuntimeError("Stage C integration database must be async PostgreSQL host db")
    if database.path != "/fitness":
        raise RuntimeError("Stage C integration database must be the ephemeral fitness database")
    if redis.scheme != "redis" or redis.hostname != "redis" or redis.path not in {"", "/0"}:
        raise RuntimeError("Stage C integration Redis must be redis host db 0")
    return database_url, redis_url


async def _create_user(session_factory, *, username: str, email: str):
    from app.models.user import User

    async with session_factory() as session:
        user = User(
            telegram_id=None,
            username=username,
            auth_email=email,
            anthropometry={},
            goals={},
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user.id


async def _check_transaction_rollback(session_factory, token: str) -> None:
    from sqlalchemy import func, select

    from app.models.user import User

    email = f"qa-rollback-{token}@example.invalid"
    try:
        async with session_factory() as session, session.begin():
            session.add(
                User(
                    telegram_id=None,
                    username=f"qa-rollback-{token}",
                    auth_email=email,
                    anthropometry={},
                    goals={},
                )
            )
            await session.flush()
            raise ExpectedRollback
    except ExpectedRollback:
        pass

    async with session_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(User).where(User.auth_email == email)
        )
    if count != 0:
        raise AssertionError("A rolled-back user remained in PostgreSQL")


async def _check_concurrent_workout_idempotency(
    session_factory,
    *,
    first_user_id: uuid.UUID,
    second_user_id: uuid.UUID,
) -> None:
    from sqlalchemy import func, select

    from app.models.user import User
    from app.models.workout import Workout
    from app.schemas.workout import WorkoutCreate
    from app.services.workout_service import create_workout

    client_workout_id = uuid.uuid4()
    request = WorkoutCreate(
        scheduled_date=date(2026, 9, 22),
        client_workout_id=client_workout_id,
        title="Stage C idempotency probe",
        workout_type="custom",
    )
    barrier = asyncio.Barrier(4)

    async def create_for_first_user() -> uuid.UUID:
        async with session_factory() as session:
            user = await session.get(User, first_user_id)
            if user is None:
                raise AssertionError("Integration user disappeared")
            await barrier.wait()
            workout = await create_workout(session, user, request)
            return workout.id

    outcomes = await asyncio.gather(
        *(create_for_first_user() for _ in range(4)),
        return_exceptions=True,
    )
    failures = [outcome for outcome in outcomes if isinstance(outcome, BaseException)]
    if failures:
        raise failures[0]
    workout_ids = [outcome for outcome in outcomes if isinstance(outcome, uuid.UUID)]
    if len(workout_ids) != len(outcomes):
        raise AssertionError("Concurrent retry returned an invalid workout id")
    if len(set(workout_ids)) != 1:
        raise AssertionError("Concurrent retries returned different workout ids")

    async with session_factory() as session:
        first_count = await session.scalar(
            select(func.count())
            .select_from(Workout)
            .where(
                Workout.user_id == first_user_id,
                Workout.client_workout_id == client_workout_id,
            )
        )
        second_user = await session.get(User, second_user_id)
        if second_user is None:
            raise AssertionError("Second integration user disappeared")
        second_workout = await create_workout(session, second_user, request)

    if first_count != 1 or second_workout.id == workout_ids[0]:
        raise AssertionError("Workout idempotency is not scoped to one user")


async def _check_archiving(session_factory, token: str) -> None:
    from sqlalchemy import func, select

    from app.models.user import User

    email = f"qa-archive-{token}@example.invalid"
    archived_id = await _create_user(
        session_factory,
        username=f"qa-archived-{token}",
        email=email,
    )
    async with session_factory() as session:
        archived = await session.get(User, archived_id)
        if archived is None:
            raise AssertionError("Archive probe user disappeared")
        archived.is_deleted = True
        await session.commit()

    await _create_user(
        session_factory,
        username=f"qa-active-{token}",
        email=email.upper(),
    )
    async with session_factory() as session:
        total = await session.scalar(
            select(func.count()).select_from(User).where(func.lower(User.auth_email) == email)
        )
        active = await session.scalar(
            select(func.count())
            .select_from(User)
            .where(func.lower(User.auth_email) == email, User.is_deleted.is_(False))
        )
    if total != 2 or active != 1:
        raise AssertionError("Archived identity did not release the active email constraint")


async def _check_audit_trigger(session_factory, token: str) -> None:
    from sqlalchemy import delete, update
    from sqlalchemy.exc import DBAPIError

    from app.models.admin_audit_log import AdminAuditLog

    async with session_factory() as session:
        audit = AdminAuditLog(
            action="qa.stage_c",
            object_type="integration_probe",
            result="success",
            description=f"Stage C {token}",
            before_data={},
            after_data={},
            correlation_id=uuid.uuid4(),
        )
        session.add(audit)
        await session.flush()

        for statement in (
            update(AdminAuditLog).where(AdminAuditLog.id == audit.id).values(action="qa.changed"),
            delete(AdminAuditLog).where(AdminAuditLog.id == audit.id),
        ):
            try:
                async with session.begin_nested():
                    await session.execute(statement)
            except DBAPIError as exc:
                if "admin_audit_log is append-only" not in str(exc):
                    raise
            else:
                raise AssertionError("The append-only audit trigger allowed a mutation")
        await session.rollback()


async def _check_real_redis_lock(redis_url: str) -> None:
    from redis.asyncio import Redis

    from app.tasks.notifications import _claim_dispatch_minute

    client = Redis.from_url(
        redis_url,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    probe_time = datetime(2099, 12, 31, 23, 59, tzinfo=UTC)
    key = "fitness:notifications:dispatch:209912312359"
    try:
        if await client.ping() is not True:
            raise AssertionError("Redis did not answer PING")
        await client.delete(key)
        claims = await asyncio.gather(
            *(_claim_dispatch_minute(client, probe_time) for _ in range(8))
        )
        if sum(claims) != 1:
            raise AssertionError("Redis allowed more than one dispatch claim")
        ttl = await client.ttl(key)
        if not 1 <= ttl <= 180:
            raise AssertionError("Redis dispatch claim has an invalid TTL")
    finally:
        await client.delete(key)
        await client.aclose()


async def _cleanup(session_factory, token: str) -> None:
    from sqlalchemy import delete, select

    from app.models.user import User
    from app.models.workout import Workout

    async with session_factory() as session:
        user_ids = select(User.id).where(User.username.like(f"qa-%-{token}"))
        await session.execute(delete(Workout).where(Workout.user_id.in_(user_ids)))
        await session.execute(delete(User).where(User.id.in_(user_ids)))
        await session.commit()


async def run_checks(database_url: str, redis_url: str) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    token = uuid.uuid4().hex[:12]
    try:
        await _check_transaction_rollback(session_factory, token)
        first_user_id = await _create_user(
            session_factory,
            username=f"qa-first-{token}",
            email=f"qa-first-{token}@example.invalid",
        )
        second_user_id = await _create_user(
            session_factory,
            username=f"qa-second-{token}",
            email=f"qa-second-{token}@example.invalid",
        )
        await _check_concurrent_workout_idempotency(
            session_factory,
            first_user_id=first_user_id,
            second_user_id=second_user_id,
        )
        await _check_archiving(session_factory, token)
        await _check_audit_trigger(session_factory, token)
        await _check_real_redis_lock(redis_url)
    finally:
        await _cleanup(session_factory, token)
        await engine.dispose()


def main() -> None:
    database_url, redis_url = validate_environment(os.environ)
    asyncio.run(asyncio.wait_for(run_checks(database_url, redis_url), timeout=90))
    print("STAGE_C_INTEGRATION_OK")
    print("postgres=rollback,idempotency,user_isolation,archive,audit_trigger")
    print("redis=ping,single_claim,ttl")


if __name__ == "__main__":
    main()
