"""Persistence helpers for daily wellbeing metrics."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_metric import DailyMetric
from app.models.user import User
from app.schemas.daily_metrics import DailyMetricUpdate

METRIC_FIELDS = ("sleep_minutes", "steps", "active_minutes", "weight_kg")


async def get_for_day(
    session: AsyncSession,
    user: User,
    day: date,
) -> DailyMetric | None:
    return await session.scalar(
        select(DailyMetric).where(
            DailyMetric.user_id == user.id,
            DailyMetric.date == day,
            DailyMetric.is_deleted.is_(False),
        )
    )


async def save_for_day(
    session: AsyncSession,
    user: User,
    day: date,
    body: DailyMetricUpdate,
) -> DailyMetric:
    row = await get_for_day(session, user, day)
    if row is None:
        row = DailyMetric(user_id=user.id, date=day, sources={})
        session.add(row)

    sources = dict(row.sources or {})
    for field in METRIC_FIELDS:
        if field not in body.model_fields_set:
            continue
        setattr(row, field, getattr(body, field))
        if getattr(body, field) is None:
            sources.pop(field, None)
        else:
            sources[field] = "manual"
    row.sources = sources
    row.is_deleted = False
    await session.commit()
    await session.refresh(row)
    return row


async def list_range(
    session: AsyncSession,
    user: User,
    start: date,
    end: date,
) -> list[DailyMetric]:
    rows = await session.scalars(
        select(DailyMetric)
        .where(
            DailyMetric.user_id == user.id,
            DailyMetric.date >= start,
            DailyMetric.date <= end,
            DailyMetric.is_deleted.is_(False),
        )
        .order_by(DailyMetric.date.asc())
    )
    return list(rows)
