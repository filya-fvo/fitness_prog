"""Persistence for dated body measurements."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.body_measurement import BodyMeasurement
from app.models.user import User
from app.schemas.body_measurements import BodyMeasurementUpdate, MEASUREMENT_FIELDS


async def get_for_day(
    session: AsyncSession,
    user: User,
    day: date,
) -> BodyMeasurement | None:
    return await session.scalar(
        select(BodyMeasurement).where(
            BodyMeasurement.user_id == user.id,
            BodyMeasurement.date == day,
            BodyMeasurement.is_deleted.is_(False),
        )
    )


async def list_range(
    session: AsyncSession,
    user: User,
    start: date,
    end: date,
) -> list[BodyMeasurement]:
    rows = await session.scalars(
        select(BodyMeasurement)
        .where(
            BodyMeasurement.user_id == user.id,
            BodyMeasurement.date >= start,
            BodyMeasurement.date <= end,
            BodyMeasurement.is_deleted.is_(False),
        )
        .order_by(BodyMeasurement.date.asc())
    )
    return list(rows)


async def _sync_latest_profile_snapshot(session: AsyncSession, user: User) -> None:
    latest = await session.scalar(
        select(BodyMeasurement)
        .where(
            BodyMeasurement.user_id == user.id,
            BodyMeasurement.is_deleted.is_(False),
        )
        .order_by(BodyMeasurement.date.desc(), BodyMeasurement.updated_at.desc())
        .limit(1)
    )
    if latest is None:
        return
    values = {
        field: float(getattr(latest, field))
        for field in MEASUREMENT_FIELDS
        if getattr(latest, field) is not None
    }
    latest_weight = await session.scalar(
        select(BodyMeasurement)
        .where(
            BodyMeasurement.user_id == user.id,
            BodyMeasurement.weight_kg.is_not(None),
            BodyMeasurement.is_deleted.is_(False),
        )
        .order_by(BodyMeasurement.date.desc(), BodyMeasurement.updated_at.desc())
        .limit(1)
    )
    anthropometry = dict(user.anthropometry or {})
    anthropometry["measurements"] = values
    if latest_weight is not None:
        anthropometry["weight_kg"] = float(latest_weight.weight_kg)
    anthropometry["measurements_updated_at"] = datetime.combine(
        latest.date, datetime.min.time(), tzinfo=timezone.utc
    ).isoformat()
    user.anthropometry = anthropometry
    flag_modified(user, "anthropometry")


async def save_for_day(
    session: AsyncSession,
    user: User,
    day: date,
    body: BodyMeasurementUpdate,
) -> BodyMeasurement:
    row = await get_for_day(session, user, day)
    if row is None:
        row = BodyMeasurement(user_id=user.id, date=day, sources={})
        session.add(row)

    sources = dict(row.sources or {})
    for field in MEASUREMENT_FIELDS:
        if field not in body.model_fields_set:
            continue
        value = getattr(body, field)
        setattr(row, field, value)
        if value is None:
            sources.pop(field, None)
        else:
            sources[field] = "manual"
    if "note" in body.model_fields_set:
        row.note = body.note.strip() if body.note and body.note.strip() else None
    row.sources = sources
    row.is_deleted = False
    await session.flush()
    await _sync_latest_profile_snapshot(session, user)
    await session.commit()
    await session.refresh(row)
    return row
