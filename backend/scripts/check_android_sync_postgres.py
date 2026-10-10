"""Integration tests use only a disposable, explicitly identified local cluster."""

import os
from pathlib import Path

os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://fitness_android_test@127.0.0.1:55439/fitness_android_sync_test"
)
os.environ["LOG_DIR"] = str(
    Path(__file__).resolve().parents[2] / "artifacts" / "android-sync-release" / "logs"
)
import asyncio
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.core.database import Base
from app.models.user import User
from app.models.workout import Workout
from app.models.exercise import Exercise
from fastapi import HTTPException
from app.schemas.android_sync import Operation
from app.services.android_sync import service


async def main():
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.begin() as conn:
        # This fixture never drops a database/table or alters existing user data.
        for table in Base.metadata.tables.values():
            for column in table.columns:
                typ = column.type
                if hasattr(typ, "enums") and getattr(typ, "name", None):
                    await conn.run_sync(lambda sync, t=typ: t.create(sync, checkfirst=True))
        await conn.run_sync(Base.metadata.create_all)
        migration = (
            Path(__file__).resolve().parents[2]
            / "supabase"
            / "migrations"
            / "20261008000053_android_sync.sql"
        )
        # asyncpg prepared statements accept one command per execute.
        source = "\n".join(
            line
            for line in migration.read_text().splitlines()
            if not line.lstrip().startswith("--")
        )
        if await conn.scalar(text("SELECT to_regclass('android_sync_cursors')")) is not None:
            source = ""
        for sql in source.split(";"):
            if sql.strip():
                await conn.execute(text(sql))
    owner, other = uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine, expire_on_commit=False) as session:
        session.add_all(
            [
                User(
                    id=x,
                    goals={"timezone": "Europe/Moscow"},
                    anthropometry={},
                    subscription_status="pro_stars",
                )
                for x in (owner, other)
            ]
        )
        await session.commit()
    day = datetime.now(ZoneInfo("Europe/Moscow")).date().isoformat()

    def op(kind, identity, action, body, revision=None):
        return Operation(
            id=uuid.uuid4(),
            owner=owner,
            kind=kind,
            entityId=identity,
            action=action,
            body=body,
            baseRevision=revision,
            createdAt=1,
        )

    create = op(
        "workout",
        str(uuid.uuid4()),
        "create",
        {"scheduled_date": day, "exercise_ids": [], "title": "Integration test"},
    )
    first = await service.push(engine, owner, create)
    retry = await service.push(engine, owner, create)
    assert first == retry, "lost response retry differs"
    wid = first["entity"]["id"]
    async with AsyncSession(engine) as session:
        count = await session.scalar(
            text("SELECT count(*) FROM workouts WHERE user_id=:u"), {"u": owner}
        )
        assert count == 1, "duplicate workout"
    try:
        await service.push(engine, other, create)
    except HTTPException as exc:
        assert exc.status_code == 403
    else:
        raise AssertionError("foreign operation accepted")
    # Change made through the ordinary web/domain database, outside the feed.
    async with AsyncSession(engine) as session:
        row = await session.get(Workout, uuid.UUID(wid))
        row.title = "Web change"
        await session.commit()
    pulled = await service.pull(engine, owner, 0, 100)
    latest = [x for x in pulled["changes"] if x["id"] == wid][-1]
    assert latest["data"]["title"] == "Web change"
    stale = op(
        "workout",
        wid,
        "update",
        {"title": "Offline change"},
        first["entity"]["revision"],
    )
    try:
        await service.push(engine, owner, stale)
    except HTTPException as exc:
        assert exc.status_code == 409 and exc.detail["entity"]["data"]["title"] == "Web change"
    else:
        raise AssertionError("stale update overwrote web")
    foreign = await service.pull(engine, other, 0, 100)
    assert not foreign["changes"], "foreign diary exposed"
    # Atomicity when a failure happens after the domain's own commit/savepoint.
    original = service.refresh
    calls = 0

    async def fail_after_domain(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("injected receipt failure")
        return await original(*args, **kwargs)

    service.refresh = fail_after_domain
    broken = op(
        "workout",
        str(uuid.uuid4()),
        "create",
        {"scheduled_date": day, "exercise_ids": [], "title": "Must rollback"},
    )
    try:
        try:
            await service.push(engine, owner, broken)
        except RuntimeError:
            pass
        else:
            raise AssertionError("injected failure missed")
    finally:
        service.refresh = original
    async with AsyncSession(engine) as session:
        assert (
            await session.scalar(
                text("SELECT count(*) FROM workouts WHERE user_id=:u"), {"u": owner}
            )
            == 1
        ), "domain commit escaped receipt transaction"
        assert (
            await session.scalar(
                text("SELECT count(*) FROM android_sync_receipts WHERE user_id=:u"),
                {"u": owner},
            )
            == 1
        )
    exercise_id = uuid.uuid4()
    async with AsyncSession(engine) as session:
        session.add(Exercise(id=exercise_id, name_ru="QA exercise", muscle_group="chest"))
        await session.commit()
    added = await service.push(
        engine,
        owner,
        op(
            "workout",
            wid,
            "set",
            {
                "exercise_id": str(exercise_id),
                "set_number": 1,
                "reps": 10,
                "weight": 50,
                "is_completed": True,
            },
            latest["revision"],
        ),
    )
    assert any(s["reps"] == 10 for s in added["entity"]["data"]["sets"]), (
        "aggregate missed committed set"
    )
    completed = await service.push(
        engine,
        owner,
        op("workout", wid, "complete", {"rpe": 7}, added["entity"]["revision"]),
    )
    assert completed["entity"]["data"]["status"] == "completed"
    assert await service.push(engine, owner, create) == first, (
        "receipt must remain stable after later edits"
    )
    deleted = await service.push(
        engine, owner, op("workout", wid, "delete", {}, completed["entity"]["revision"])
    )
    assert deleted["entity"]["deleted"]
    tombstones = await service.pull(engine, owner, int(pulled["cursor"]), 100)
    assert any(x["id"] == wid and x["deleted"] for x in tombstones["changes"])
    product = await service.push(
        engine,
        owner,
        op(
            "product",
            str(uuid.uuid4()),
            "create",
            {
                "name_ru": "Test product",
                "calories": 100,
                "proteins": 10,
                "fats": 2,
                "carbs": 8,
            },
        ),
    )
    log = await service.push(
        engine,
        owner,
        op(
            "nutrition_log",
            str(uuid.uuid4()),
            "create",
            {
                "date": day,
                "meal_type": "breakfast",
                "product_id": product["entity"]["id"],
                "quantity_grams": 200,
            },
        ),
    )
    assert log["entity"]["data"]["calculated_kbj"]["calories"] == 200
    measure = await service.push(engine, owner, op("measurement", day, "upsert", {"weight_kg": 72}))
    assert measure["entity"]["data"]["weight_kg"] == 72
    print(
        "PASS: real PostgreSQL receipts, lost response, ownership, web pull, conflict, rollback, tombstone, product/log, measurement"
    )

    # Scope changes cannot disclose historical data through pull, conflicts or receipts.
    from app.models.user_entitlement import UserEntitlement
    from datetime import timedelta

    entitlement = uuid.uuid4()
    async with AsyncSession(engine) as session:
        session.add(
            UserEntitlement(
                id=entitlement,
                user_id=owner,
                code="plus",
                source="qa",
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        await session.commit()
    past = (date.fromisoformat(day) - timedelta(days=3)).isoformat()
    historical = op("measurement", past, "upsert", {"weight_kg": 68})
    old = await service.push(engine, owner, historical)
    plus_feed = await service.pull(engine, owner, 0, 100)
    assert plus_feed["scope"] == "history"
    assert any(
        x["id"] == past and not x["deleted"] and x["data"]["weight_kg"] == 68
        for x in plus_feed["changes"]
    )
    async with AsyncSession(engine) as session:
        row = await session.get(UserEntitlement, entitlement)
        row.revoked_at = datetime.now(timezone.utc)
        await session.commit()
    free_feed = await service.pull(engine, owner, 0, 100)
    masked = [x for x in free_feed["changes"] if x["id"] == past][0]
    assert masked["deleted"] and masked["unavailable"] and masked["data"] == {}
    for attempt in (
        historical,
        op("measurement", past, "upsert", {"weight_kg": 69}, "0"),
    ):
        try:
            await service.push(engine, owner, attempt)
        except HTTPException as exc:
            assert exc.status_code == 403 and isinstance(exc.detail, str)
        else:
            raise AssertionError("past data leaked through receipt/conflict")
    try:
        await service.pull(engine, owner, int(free_feed["cursor"]) + 1, 100)
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError("foreign cursor accepted")
    cursor = 0
    scanned = 0
    while True:
        page = await service.pull(engine, owner, cursor, 1)
        assert int(page["cursor"]) >= cursor
        scanned += len(page["changes"])
        cursor = int(page["cursor"])
        if not page["hasMore"]:
            break
    assert cursor == int(free_feed["cursor"]) and scanned > 0
    async with AsyncSession(engine) as session:
        row = await session.get(UserEntitlement, entitlement)
        row.revoked_at = None
        await session.commit()
    restored = await service.pull(engine, owner, 0, 100)
    restored_row = [x for x in restored["changes"] if x["id"] == past][0]
    assert restored_row["revision"] == old["entity"]["revision"] and not restored_row["deleted"]
    print(
        "PASS: PLUS downgrade/restore, no historical conflict/receipt leakage, invalid cursor, paginated feed"
    )

    # Exercise the actual auth dependency and HTTP router before a SPA fallback.
    import httpx
    from app.core.security import create_access_token
    from app.main import app as http_app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=http_app), base_url="http://test.invalid"
    ) as client:
        unauth = await client.get("/android-sync/v1/pull")
        assert unauth.status_code in (401, 403)
        token = create_access_token(subject=str(owner))
        headers = {"Authorization": "Bearer " + token}
        reply = await client.get("/android-sync/v1/pull", headers=headers)
        assert (
            reply.status_code == 200 and reply.json()["version"] == 1 and "spa" not in reply.json()
        )
        http_op = op(
            "measurement",
            day,
            "upsert",
            {"weight_kg": 74},
            measure["entity"]["revision"],
        )
        reply = await client.post(
            "/android-sync/v1/push",
            headers=headers,
            json=http_op.model_dump(mode="json"),
        )
        assert reply.status_code == 200 and reply.json()["entity"]["data"]["weight_kg"] == 74
        repeat = await client.post(
            "/android-sync/v1/push",
            headers=headers,
            json=http_op.model_dump(mode="json"),
        )
        assert repeat.json() == reply.json()
        foreign_headers = {"Authorization": "Bearer " + create_access_token(subject=str(other))}
        denied = await client.post(
            "/android-sync/v1/push",
            headers=foreign_headers,
            json=http_op.model_dump(mode="json"),
        )
        assert denied.status_code == 403
    print("PASS: HTTP signed JWT, push/pull/receipt, foreign owner denial, API before SPA fallback")

    from check_android_login_postgres import check_login
    await check_login(engine)
    from check_offline_workout_postgres import check_offline_workout
    await check_offline_workout(engine)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
