"""Atomic receipts and per-account feed over existing domain transactions."""

import hashlib
import json
import uuid
from contextlib import asynccontextmanager
from datetime import date
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from fastapi import HTTPException
from app.models.user import User
from app.deps import user_has_plus, user_local_day
from app.schemas.android_sync import Operation, Entity
from .snapshot import snapshot
from .dispatch import dispatch


def fingerprint(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode()
    ).hexdigest()


def payload(row):
    value = row["payload"]
    return json.loads(value) if isinstance(value, str) else value


def entity(user_id, row) -> Entity:
    return Entity(
        key=f"{user_id}:{row['kind']}:{row['entity_id']}",
        owner=str(user_id),
        kind=row["kind"],
        id=row["entity_id"],
        revision=str(row["revision"]),
        deleted=row["deleted"],
        data=payload(row),
    )


@asynccontextmanager
async def unit_of_work(engine: AsyncEngine, user_id: uuid.UUID):
    async with engine.connect() as connection:
        connection = await connection.execution_options(isolation_level="SERIALIZABLE")
        async with connection.begin():
            await connection.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:owner,0))"),
                {"owner": str(user_id)},
            )
            # Domain services may commit savepoints; outer commit includes receipt/feed.
            async with AsyncSession(
                bind=connection,
                expire_on_commit=False,
                autoflush=False,
                join_transaction_mode="create_savepoint",
            ) as session:
                user = await session.scalar(
                    select(User).where(User.id == user_id, User.is_deleted.is_(False))
                )
                if user is None:
                    raise HTTPException(401, "Войдите в аккаунт")
                yield session, user
                # Flush SQLAlchemy's currently open savepoint before outer commit.
                await session.commit()


async def write_entity(session, user_id, kind, identity, data, deleted, day):
    revision = await session.scalar(
        text("""INSERT INTO android_sync_cursors(user_id,revision) VALUES(:owner,1)
        ON CONFLICT(user_id) DO UPDATE SET revision=android_sync_cursors.revision+1 RETURNING revision"""),
        {"owner": user_id},
    )
    values = {
        "owner": user_id,
        "kind": kind,
        "identity": identity,
        "revision": revision,
        "hash": fingerprint({"data": data, "deleted": deleted}),
        "deleted": deleted,
        "payload": json.dumps(data, ensure_ascii=False, allow_nan=False),
        "day": date.fromisoformat(day) if isinstance(day, str) else day,
    }
    await session.execute(
        text("""INSERT INTO android_sync_entities(user_id,kind,entity_id,revision,fingerprint,deleted,payload,day)
        VALUES(:owner,:kind,:identity,:revision,:hash,:deleted,CAST(:payload AS jsonb),CAST(:day AS date))
        ON CONFLICT(user_id,kind,entity_id) DO UPDATE SET revision=EXCLUDED.revision,fingerprint=EXCLUDED.fingerprint,
        deleted=EXCLUDED.deleted,payload=EXCLUDED.payload,day=EXCLUDED.day"""),
        values,
    )
    await session.execute(
        text("""INSERT INTO android_sync_events(user_id,revision,kind,entity_id,deleted,payload,day)
        VALUES(:owner,:revision,:kind,:identity,:deleted,CAST(:payload AS jsonb),CAST(:day AS date))"""),
        values,
    )


async def refresh(session, user, extra_products=None):
    previous = (
        (
            await session.execute(
                text("SELECT * FROM android_sync_entities WHERE user_id=:owner"),
                {"owner": user.id},
            )
        )
        .mappings()
        .all()
    )
    known = {r["entity_id"] for r in previous if r["kind"] == "product"} | (extra_products or set())
    current = await snapshot(session, user, known)
    old = {(r["kind"], r["entity_id"]): r for r in previous}
    for (kind, identity), data in current.items():
        prior = old.get((kind, identity))
        if prior and prior["fingerprint"] == fingerprint({"data": data, "deleted": False}):
            continue
        day = data.get("scheduled_date") or data.get("date")
        await write_entity(session, user.id, kind, identity, data, False, day)
    for (kind, identity), prior in old.items():
        if (kind, identity) not in current and not prior["deleted"]:
            await write_entity(session, user.id, kind, identity, {}, True, prior["day"])
    await session.flush()


def visible(row, plus, day):
    if plus or row["kind"] == "product" or row["day"] == day:
        return True
    data = payload(row)
    return row["kind"] == "workout" and not row["deleted"] and data.get("status") == "planned"


async def push(engine: AsyncEngine, user_id: uuid.UUID, operation: Operation):
    if operation.owner != user_id:
        raise HTTPException(403, "Операция принадлежит другому аккаунту")
    raw = operation.model_dump(mode="json")
    if len(json.dumps(raw)) > 1024 * 1024:
        raise HTTPException(413, "Операция слишком большая")
    digest = fingerprint(raw)
    async with unit_of_work(engine, user_id) as (session, user):
        receipt = (
            (
                await session.execute(
                    text(
                        "SELECT fingerprint,result FROM android_sync_receipts WHERE user_id=:owner AND operation_id=:op"
                    ),
                    {"owner": user_id, "op": operation.id},
                )
            )
            .mappings()
            .first()
        )
        if receipt:
            await refresh(session, user)
            if receipt["fingerprint"] != digest:
                raise HTTPException(409, "Идентификатор операции уже использован")
            saved = receipt["result"]
            saved = json.loads(saved) if isinstance(saved, str) else saved
            item = saved["entity"]
            current = (
                (
                    await session.execute(
                        text(
                            "SELECT * FROM android_sync_entities WHERE user_id=:owner AND kind=:kind AND entity_id=:id"
                        ),
                        {"owner": user_id, "kind": item["kind"], "id": item["id"]},
                    )
                )
                .mappings()
                .first()
            )
            if current and not visible(
                current, await user_has_plus(session, user), user_local_day(user)
            ):
                raise HTTPException(403, "История доступна в PLUS")
            result = receipt["result"]
            return json.loads(result) if isinstance(result, str) else result
        await refresh(session, user)
        current = (
            (
                await session.execute(
                    text(
                        "SELECT * FROM android_sync_entities WHERE user_id=:owner AND kind=:kind AND entity_id=:id"
                    ),
                    {
                        "owner": user_id,
                        "kind": operation.kind,
                        "id": operation.entityId,
                    },
                )
            )
            .mappings()
            .first()
        )
        if current and not visible(
            current, await user_has_plus(session, user), user_local_day(user)
        ):
            raise HTTPException(403, "История доступна в PLUS")
        expected = str(current["revision"]) if current else None
        if operation.baseRevision != expected:
            raise HTTPException(
                409,
                {
                    "code": "sync_conflict",
                    "entity": entity(user_id, current).model_dump() if current else None,
                },
            )
        result = await dispatch(session, user, operation)
        response = result.model_dump(mode="json") if hasattr(result, "model_dump") else None
        identity = operation.entityId
        if operation.action == "create" and response:
            identity = str(response["id"])
        await refresh(session, user, {identity} if operation.kind == "product" else None)
        row = (
            (
                await session.execute(
                    text(
                        "SELECT * FROM android_sync_entities WHERE user_id=:owner AND kind=:kind AND entity_id=:id"
                    ),
                    {"owner": user_id, "kind": operation.kind, "id": identity},
                )
            )
            .mappings()
            .first()
        )
        if row is None:
            raise HTTPException(500, "Не удалось подтвердить сохранённую запись")
        ack = {
            "operationId": str(operation.id),
            "entity": entity(user_id, row).model_dump(),
            "response": response,
        }
        await session.execute(
            text(
                "INSERT INTO android_sync_receipts(user_id,operation_id,fingerprint,result) VALUES(:owner,:op,:hash,CAST(:result AS jsonb))"
            ),
            {
                "owner": user_id,
                "op": operation.id,
                "hash": digest,
                "result": json.dumps(ack, ensure_ascii=False, allow_nan=False),
            },
        )
        return ack


async def pull(engine: AsyncEngine, user_id: uuid.UUID, cursor: int, limit: int):
    async with unit_of_work(engine, user_id) as (session, user):
        await refresh(session, user)
        highwater = (
            await session.scalar(
                text("SELECT revision FROM android_sync_cursors WHERE user_id=:owner"),
                {"owner": user_id},
            )
            or 0
        )
        if cursor > highwater:
            raise HTTPException(409, "Курсор не принадлежит текущему дневнику")
        rows = (
            (
                await session.execute(
                    text(
                        "SELECT * FROM android_sync_events WHERE user_id=:owner AND revision>:cursor ORDER BY revision LIMIT :limit"
                    ),
                    {"owner": user_id, "cursor": cursor, "limit": limit},
                )
            )
            .mappings()
            .all()
        )
        plus = await user_has_plus(session, user)
        day = user_local_day(user)
        # Deliver only the latest aggregate. Historical planned versions cannot
        # resurrect a record now completed/deleted. Cursor still scans every event.
        current = (
            (
                await session.execute(
                    text("SELECT * FROM android_sync_entities WHERE user_id=:owner"),
                    {"owner": user_id},
                )
            )
            .mappings()
            .all()
        )
        latest = {(r["kind"], r["entity_id"]): r for r in current}
        changes = []
        for row in rows:
            now = latest[(row["kind"], row["entity_id"])]
            if row["revision"] != now["revision"]:
                continue
            value = entity(user_id, now).model_dump()
            if not visible(now, plus, day):
                # Access projection removes a previously cached planned/current-day
                # record without revealing inaccessible history. PLUS scope replay
                # later restores the canonical data at the same revision.
                value["deleted"] = True
                value["unavailable"] = True
                value["data"] = {}
            changes.append(value)
        next_cursor = rows[-1]["revision"] if rows else cursor
        return {
            "version": 1,
            "scope": "history" if plus else "operational:" + day.isoformat(),
            "changes": changes,
            "cursor": str(next_cursor),
            "hasMore": next_cursor < highwater,
        }
