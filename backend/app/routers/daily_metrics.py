"""Manual daily sleep and movement API."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.daily_metric import DailyMetric
from app.models.user import User
from app.schemas.daily_metrics import (
    DailyMetricRangeResponse,
    DailyMetricResponse,
    DailyMetricUpdate,
)
from app.services import daily_metrics

router = APIRouter(prefix="/metrics", tags=["daily-metrics"])


def _response(row: DailyMetric | None, day: date) -> DailyMetricResponse:
    if row is None:
        return DailyMetricResponse(date=day)
    return DailyMetricResponse(
        id=row.id,
        date=row.date,
        sleep_minutes=row.sleep_minutes,
        steps=row.steps,
        active_minutes=row.active_minutes,
        cycle_readiness=row.cycle_readiness,
        sources=dict(row.sources or {}),
    )


@router.get("/daily", response_model=DailyMetricResponse)
async def get_daily_metrics(
    date_value: date | None = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyMetricResponse:
    day = date_value or date.today()
    return _response(await daily_metrics.get_for_day(session, user, day), day)


@router.put("/daily", response_model=DailyMetricResponse)
async def put_daily_metrics(
    body: DailyMetricUpdate,
    date_value: date | None = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyMetricResponse:
    day = date_value or date.today()
    row = await daily_metrics.save_for_day(session, user, day, body)
    return _response(row, day)


@router.get("/range", response_model=DailyMetricRangeResponse)
async def get_metric_range(
    days: int = Query(default=14, ge=1, le=366),
    end: date | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyMetricRangeResponse:
    end_day = end or date.today()
    start_day = end_day - timedelta(days=days - 1)
    rows = await daily_metrics.list_range(session, user, start_day, end_day)
    by_date = {row.date: row for row in rows}
    return DailyMetricRangeResponse(
        start=start_day,
        end=end_day,
        days=[
            _response(
                by_date.get(start_day + timedelta(days=offset)),
                start_day + timedelta(days=offset),
            )
            for offset in range(days)
        ],
    )
