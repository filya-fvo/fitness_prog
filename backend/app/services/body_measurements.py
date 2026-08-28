"""Persistence for dated body measurements."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.body_measurement import BodyMeasurement
from app.models.user import User
from app.schemas.body_measurements import (
    BodyMeasurementAnalyticsItem,
    BodyMeasurementAnalyticsResponse,
    BodyMeasurementUpdate,
    MEASUREMENT_FIELDS,
)


def _period_start(end: date, months: int) -> date:
    month_index = end.year * 12 + end.month - 1 - months
    year, zero_based_month = divmod(month_index, 12)
    month = zero_based_month + 1
    day = min(end.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _round_measurement(value: float) -> float:
    return round(value, 2)


def _interpret_change(
    *,
    baseline: float,
    latest: float,
    target: float | None,
) -> tuple[float | None, str]:
    if target is None:
        if abs(latest - baseline) < 0.01:
            return None, "Без изменения за выбранный период"
        return None, "Изменение показано без оценки результата"
    baseline_gap = abs(baseline - target)
    latest_gap = abs(latest - target)
    if latest_gap < baseline_gap - 0.01:
        interpretation = "Значение стало ближе к заданной цели"
    elif latest_gap > baseline_gap + 0.01:
        interpretation = "Расстояние до заданной цели увеличилось"
    else:
        interpretation = "Расстояние до заданной цели не изменилось"
    return _round_measurement(latest - target), interpretation


def build_analytics(
    rows: list[BodyMeasurement],
    user: User,
    *,
    months: int,
    start: date,
    end: date,
) -> BodyMeasurementAnalyticsResponse:
    rows = sorted(rows, key=lambda row: row.date)
    goals = dict(user.goals or {})
    target_weight = goals.get("target_weight_kg")
    target_weight_value = (
        float(target_weight)
        if isinstance(target_weight, (int, float)) and not isinstance(target_weight, bool)
        else None
    )
    items: list[BodyMeasurementAnalyticsItem] = []
    for field in MEASUREMENT_FIELDS:
        points = [
            (row.date, float(value))
            for row in rows
            if (value := getattr(row, field)) is not None
        ]
        if not points:
            items.append(
                BodyMeasurementAnalyticsItem(
                    field=field,
                    points=0,
                    interpretation="Нет данных за выбранный период",
                )
            )
            continue
        baseline_date, baseline = points[0]
        latest_date, latest = points[-1]
        delta = _round_measurement(latest - baseline) if len(points) > 1 else None
        percent = (
            round((latest - baseline) / baseline * 100, 1)
            if len(points) > 1 and baseline != 0
            else None
        )
        target = target_weight_value if field == "weight_kg" else None
        target_gap, interpretation = (
            _interpret_change(baseline=baseline, latest=latest, target=target)
            if len(points) > 1
            else (
                _round_measurement(latest - target) if target is not None else None,
                "Нужен ещё один замер для сравнения",
            )
        )
        items.append(
            BodyMeasurementAnalyticsItem(
                field=field,
                points=len(points),
                baseline_value=_round_measurement(baseline),
                baseline_date=baseline_date,
                latest_value=_round_measurement(latest),
                latest_date=latest_date,
                delta=delta,
                percent_change=percent,
                target_value=target,
                target_gap=target_gap,
                interpretation=interpretation,
            )
        )
    return BodyMeasurementAnalyticsResponse(
        months=months,
        start=start,
        end=end,
        primary_goal=str(goals.get("primary_goal") or "") or None,
        items=items,
    )


async def get_analytics(
    session: AsyncSession,
    user: User,
    *,
    months: int,
    end: date,
) -> BodyMeasurementAnalyticsResponse:
    start = _period_start(end, months)
    rows = await list_range(session, user, start, end)
    return build_analytics(rows, user, months=months, start=start, end=end)


async def get_for_day(
    session: AsyncSession,
    user: User,
    day: date,
    *,
    include_deleted: bool = False,
) -> BodyMeasurement | None:
    statement = select(BodyMeasurement).where(
        BodyMeasurement.user_id == user.id,
        BodyMeasurement.date == day,
    )
    if not include_deleted:
        statement = statement.where(BodyMeasurement.is_deleted.is_(False))
    return await session.scalar(statement)


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
        anthropometry = dict(user.anthropometry or {})
        anthropometry.pop("measurements", None)
        anthropometry.pop("measurements_updated_at", None)
        user.anthropometry = anthropometry
        flag_modified(user, "anthropometry")
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


async def delete_for_day(
    session: AsyncSession,
    user: User,
    day: date,
) -> bool:
    row = await get_for_day(session, user, day)
    if row is None:
        return False
    removed_weight = float(row.weight_kg) if row.weight_kg is not None else None
    row.is_deleted = True
    await session.flush()
    await _sync_latest_profile_snapshot(session, user)
    if removed_weight is not None:
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
        if latest_weight is None:
            anthropometry = dict(user.anthropometry or {})
            if anthropometry.get("weight_kg") == removed_weight:
                anthropometry.pop("weight_kg", None)
                user.anthropometry = anthropometry
                flag_modified(user, "anthropometry")
    await session.commit()
    return True


async def save_for_day(
    session: AsyncSession,
    user: User,
    day: date,
    body: BodyMeasurementUpdate,
) -> BodyMeasurement:
    row = await get_for_day(session, user, day, include_deleted=True)
    if row is None:
        row = BodyMeasurement(user_id=user.id, date=day, sources={})
        session.add(row)
    elif row.is_deleted:
        for field in MEASUREMENT_FIELDS:
            setattr(row, field, None)
        row.note = None
        row.sources = {}

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
