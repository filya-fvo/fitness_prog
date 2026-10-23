"""Real isolated PostgreSQL checks for linking and preservation of both diaries."""

import asyncio
import importlib
import os
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.android_login import AndroidLogin
from app.models.user import User
from app.models.workout import Workout
from app.services import android_login

VERIFIER = "v" * 43
ACTOR = {"id": 123456789, "first_name": "Тест", "username": "link_fixture"}


def service():
    return importlib.import_module("app.services.telegram_link")


@pytest_asyncio.fixture
async def database():
    url = os.environ.get("TELEGRAM_LINK_TEST_URL")
    if not url:
        pytest.skip("TELEGRAM_LINK_TEST_URL required for isolated PostgreSQL tests")
    # Never run these mutating tests against a normal application database.
    from sqlalchemy.engine import make_url

    parsed = make_url(url)
    assert parsed.host == "127.0.0.1" and parsed.database == "filfit_link_test"
    schema = "telegram_link_test_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    try:
        async with engine.begin() as connection:
            types = {
                column.type.name: column.type
                for table in Base.metadata.tables.values()
                for column in table.columns
                if isinstance(column.type, ENUM)
            }
            for kind in types.values():
                await connection.run_sync(
                    lambda conn, kind=kind: kind.create(conn, checkfirst=True)
                )
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as session:
            owner = User(
                auth_email="source@example.test",
                anthropometry={"weight_kg": 80},
                goals={"onboarding_completed": True},
            )
            other = User(auth_email="other@example.test")
            session.add_all([owner, other])
            await session.commit()
            yield session, owner, other, factory
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


async def begin(session, owner, *, actor=ACTOR, source="a"):
    started = await service().start_link(
        session,
        user=owner,
        challenge=android_login.digest(VERIFIER),
        bot_username="fitness_test_bot",
        source_hash=source * 64,
    )
    token = started["bot_url"].split("telegram_link_")[1]
    assert await android_login.claim_login(session, token, actor, purpose="link")
    assert await android_login.approve_login(session, token, actor["id"], purpose="link")
    return started


@pytest.mark.asyncio
async def test_free_telegram_attaches_to_same_owner_without_changing_diary(database):
    session, owner, _, _ = database
    workout = Workout(user_id=owner.id, scheduled_date=date(2026, 10, 23), title="Моя история")
    session.add(workout)
    await session.commit()
    request = await begin(session, owner)
    result = await service().complete_link(
        session, user=owner, request_id=request["request_id"], verifier=VERIFIER
    )
    assert result.user.id == owner.id and result.user.telegram_id == ACTOR["id"]
    assert result.user.auth_email == "source@example.test"
    await session.refresh(workout)
    assert workout.user_id == owner.id and workout.title == "Моя история" and not workout.is_deleted
    with pytest.raises(HTTPException) as failure:
        await service().complete_link(
            session, user=owner, request_id=request["request_id"], verifier=VERIFIER
        )
    assert failure.value.status_code == 410


@pytest.mark.asyncio
async def test_two_diaries_require_preview_then_explicit_choice(database):
    session, owner, target, _ = database
    target.telegram_id, target.auth_email = ACTOR["id"], None
    target.anthropometry = {"weight_kg": 70}
    first = Workout(user_id=owner.id, scheduled_date=date(2026, 10, 22), title="История приложения")
    second = Workout(user_id=target.id, scheduled_date=date(2026, 10, 23), title="История Telegram")
    session.add_all([first, second])
    await session.commit()
    source_id, target_id = owner.id, target.id
    request = await begin(session, owner)
    result = await service().complete_link(
        session, user=owner, request_id=request["request_id"], verifier=VERIFIER
    )
    assert result.merge_required and result.user is None and result.merge_target_id == target_id
    assert result.preview["email"]["counts"]["workouts"] == 1
    assert result.preview["telegram"]["counts"]["workouts"] == 1
    await session.refresh(owner)
    assert not owner.is_deleted
    result = await service().complete_link(
        session,
        user=owner,
        request_id=request["request_id"],
        verifier=VERIFIER,
        merge_preference="email",
        merge_target_id=target_id,
    )
    assert result.user.id == target_id and result.user.anthropometry["weight_kg"] == 80
    histories = list(
        (
            await session.scalars(
                select(Workout).where(Workout.user_id == target_id, Workout.is_deleted.is_(False))
            )
        ).all()
    )
    assert {row.title for row in histories} == {"История приложения", "История Telegram"}
    await session.refresh(owner)
    assert owner.is_deleted and owner.merged_into_user_id == target_id and owner.id == source_id
    challenge = await session.get(AndroidLogin, request["request_id"])
    assert challenge.consumed_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["owner", "verifier", "expired", "cancel", "unapproved", "login"])
async def test_proof_errors_never_attach_telegram(database, case):
    session, owner, other, _ = database
    request = await begin(session, owner)
    selected, verifier = owner, VERIFIER
    row = await session.get(AndroidLogin, request["request_id"])
    if case == "owner":
        selected = other
    if case == "verifier":
        verifier = "x" * 43
    if case == "expired":
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    if case == "unapproved":
        row.approved_at = None
    if case == "login":
        row.purpose, row.owner_user_id = "login", None
    if case == "cancel":
        row.consumed_at = datetime.now(timezone.utc)
    await session.commit()
    with pytest.raises(HTTPException) as failure:
        await service().complete_link(
            session, user=selected, request_id=request["request_id"], verifier=verifier
        )
    assert failure.value.status_code == 410
    await session.refresh(owner)
    assert owner.telegram_id is None and not owner.is_deleted


@pytest.mark.asyncio
async def test_existing_telegram_is_not_replaced_and_wrong_merge_target_rejected(database):
    session, owner, target, _ = database
    request = await begin(session, owner)
    owner.telegram_id = 999
    await session.commit()
    with pytest.raises(HTTPException) as failure:
        await service().complete_link(
            session, user=owner, request_id=request["request_id"], verifier=VERIFIER
        )
    assert failure.value.status_code == 409
    await session.rollback()
    await session.refresh(owner)
    assert owner.telegram_id == 999
    owner.telegram_id, target.telegram_id = None, ACTOR["id"]
    target.auth_email = None
    await session.commit()
    with pytest.raises(HTTPException) as failure:
        await service().complete_link(
            session,
            user=owner,
            request_id=request["request_id"],
            verifier=VERIFIER,
            merge_preference="email",
            merge_target_id=uuid4(),
        )
    assert failure.value.status_code == 409


@pytest.mark.asyncio
async def test_competing_link_requests_cannot_overwrite_telegram(database):
    session, owner, _, factory = database
    one = await begin(session, owner)
    two = await begin(session, owner, actor={**ACTOR, "id": 987654321}, source="b")
    owner_id = owner.id

    async def complete(request):
        async with factory() as isolated:
            user = await isolated.get(User, owner_id)
            try:
                result = await service().complete_link(
                    isolated, user=user, request_id=request["request_id"], verifier=VERIFIER
                )
                return result.user.telegram_id
            except HTTPException as failure:
                await isolated.rollback()
                return failure.status_code

    results = await asyncio.gather(complete(one), complete(two))
    assert results.count(409) == 1
    assert len([result for result in results if result in [123456789, 987654321]]) == 1


def test_link_api_routes_require_authenticated_owner():
    from app.main import app
    from fastapi.testclient import TestClient

    client = TestClient(app)
    for path in ["start", "status", "cancel", "complete"]:
        response = client.post("/auth/telegram/link/" + path, json={})
        assert response.status_code in {401, 403}, (path, response.status_code)


@pytest.mark.asyncio
async def test_same_request_can_complete_only_once_under_concurrency(database):
    session, owner, _, factory = database
    request = await begin(session, owner)
    owner_id = owner.id

    async def complete():
        async with factory() as isolated:
            user = await isolated.get(User, owner_id)
            try:
                result = await service().complete_link(
                    isolated, user=user, request_id=request["request_id"], verifier=VERIFIER
                )
                return result.user.telegram_id
            except HTTPException as failure:
                await isolated.rollback()
                return failure.status_code

    assert sorted(await asyncio.gather(complete(), complete())) == [410, 123456789]


@pytest.mark.asyncio
@pytest.mark.parametrize("deleted", ["owner", "target"])
async def test_deleted_accounts_cannot_attach_or_merge(database, deleted):
    session, owner, target, _ = database
    request = await begin(session, owner)
    if deleted == "target":
        target.telegram_id = ACTOR["id"]
    (owner if deleted == "owner" else target).is_deleted = True
    await session.commit()
    with pytest.raises(HTTPException) as failure:
        await service().complete_link(
            session, user=owner, request_id=request["request_id"], verifier=VERIFIER
        )
    assert failure.value.status_code == 409


@pytest.mark.asyncio
async def test_merge_failure_does_not_consume_challenge_or_delete_diary(database, monkeypatch):
    session, owner, target, _ = database
    target.telegram_id, target.auth_email = ACTOR["id"], None
    await session.commit()
    request = await begin(session, owner)
    target_id = target.id

    async def fail(*args, **kwargs):
        raise ValueError("fixture conflict")

    monkeypatch.setattr(service(), "merge_accounts", fail)
    with pytest.raises(HTTPException) as failure:
        await service().complete_link(
            session,
            user=owner,
            request_id=request["request_id"],
            verifier=VERIFIER,
            merge_preference="email",
            merge_target_id=target_id,
        )
    assert failure.value.status_code == 409
    row = await session.get(AndroidLogin, request["request_id"])
    await session.refresh(owner)
    assert row.consumed_at is None and not owner.is_deleted and owner.telegram_id is None


@pytest.mark.asyncio
async def test_authenticated_http_flow_and_validation_never_expose_proof(database):
    import httpx
    from loguru import logger
    from app.main import app
    from app.core.config import Settings, get_settings
    from app.core.database import get_db
    from app.core.security import create_access_token, decode_access_token

    session, owner, other, _ = database
    settings = Settings(
        environment="test", bot_username="fitness_test_bot", jwt_secret="fixture-only-test-secret"
    )
    owner_id, other_id = owner.id, other.id

    async def db():
        yield session

    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_settings] = lambda: settings

    def auth(subject):
        return {
            "Authorization": "Bearer "
            + create_access_token(subject=str(subject), telegram_id=None, settings=settings)
        }

    logs = []
    sink = logger.add(lambda message: logs.append(str(message)))
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            start = await client.post(
                "/auth/telegram/link/start",
                headers=auth(owner_id),
                json={"challenge": android_login.digest(VERIFIER)},
            )
            assert start.status_code == 200
            request = start.json()
            proof = {"request_id": request["request_id"], "verifier": VERIFIER}
            assert (
                await client.post("/auth/telegram/link/status", headers=auth(owner_id), json=proof)
            ).json()["state"] == "waiting"
            assert (
                await client.post("/auth/telegram/link/status", headers=auth(other_id), json=proof)
            ).status_code == 410
            token = request["bot_url"].split("telegram_link_")[1]
            assert await android_login.claim_login(session, token, ACTOR, purpose="link")
            assert await android_login.approve_login(session, token, ACTOR["id"], purpose="link")
            assert (
                await client.post("/auth/telegram/link/status", headers=auth(owner_id), json=proof)
            ).json()["state"] == "ready"
            invalid_secret = "private-verifier-do-not-expose!"
            invalid = await client.post(
                "/auth/telegram/link/complete",
                headers=auth(owner_id),
                json={**proof, "verifier": invalid_secret},
            )
            assert invalid.status_code == 422 and invalid_secret not in invalid.text
            assert invalid_secret not in "".join(logs)
            done = await client.post(
                "/auth/telegram/link/complete", headers=auth(owner_id), json=proof
            )
            assert done.status_code == 200
            assert done.json()["user"]["id"] == str(owner_id)
            assert decode_access_token(done.json()["access_token"], settings=settings)[
                "sub"
            ] == str(owner_id)
            assert (
                await client.post(
                    "/auth/telegram/link/complete", headers=auth(owner_id), json=proof
                )
            ).status_code == 410
    finally:
        app.dependency_overrides.clear()
        logger.remove(sink)


@pytest.mark.asyncio
async def test_append_only_migration_preserves_existing_login(database):
    from pathlib import Path

    session, owner, _, _ = database
    migrations = Path(__file__).resolve().parents[2] / "supabase/migrations"
    await session.commit()
    connection = await session.connection()
    raw = await connection.get_raw_connection()
    await raw.driver_connection.execute("DROP TABLE android_login_requests")
    await raw.driver_connection.execute(
        (migrations / "20261008000055_android_login.sql").read_text(encoding="utf-8")
    )
    await raw.driver_connection.execute(
        (migrations / "20261023090000_telegram_link_requests.sql").read_text(encoding="utf-8")
    )
    await session.commit()
    request = await android_login.start_login(
        session, android_login.digest(VERIFIER), "fitness_test_bot", "a" * 64
    )
    token = request["bot_url"].split("android_login_")[1]
    assert await android_login.claim_login(session, token, ACTOR)
    assert await android_login.approve_login(session, token, ACTOR["id"])
    assert (
        await android_login.consume_login(session, request["request_id"], VERIFIER)
    ).id == ACTOR["id"]
