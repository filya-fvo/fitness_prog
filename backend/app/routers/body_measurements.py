"""Dated body measurement API."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.body_measurement import BodyMeasurement
from app.models.user import User
from app.schemas.body_measurements import (
    BodyMeasurementRangeResponse,
    BodyMeasurementResponse,
    BodyMeasurementUpdate,
    MEASUREMENT_FIELDS,
)
from app.services import body_measurements

router = APIRouter(prefix="/measurements", tags=["body-measurements"])


def _response(row: BodyMeasurement | None, day: date) -> BodyMeasurementResponse:
    if row is None:
        return BodyMeasurementResponse(date=day)
    values = {
        field: float(getattr(row, field)) if getattr(row, field) is not None else None
        for field in MEASUREMENT_FIELDS
    }
    return BodyMeasurementResponse(
        id=row.id,
        date=row.date,
        note=row.note,
        sources=dict(row.sources or {}),
        **values,
    )


@router.get("/daily", response_model=BodyMeasurementResponse)
async def get_daily_measurement(
    date_value: date | None = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BodyMeasurementResponse:
    day = date_value or date.today()
    return _response(await body_measurements.get_for_day(session, user, day), day)


@router.put("/daily", response_model=BodyMeasurementResponse)
async def put_daily_measurement(
    body: BodyMeasurementUpdate,
    date_value: date | None = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BodyMeasurementResponse:
    day = date_value or date.today()
    row = await body_measurements.save_for_day(session, user, day, body)
    return _response(row, day)


@router.delete("/daily", status_code=status.HTTP_204_NO_CONTENT)
async def delete_daily_measurement(
    date_value: date | None = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    day = date_value or date.today()
    deleted = await body_measurements.delete_for_day(session, user, day)
    if not deleted:
        raise HTTPException(status_code=404, detail="Замер не найден")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/range", response_model=BodyMeasurementRangeResponse)
async def get_measurement_range(
    days: int = Query(default=180, ge=1, le=3660),
    end: date | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BodyMeasurementRangeResponse:
    end_day = end or date.today()
    start_day = end_day - timedelta(days=days - 1)
    rows = await body_measurements.list_range(session, user, start_day, end_day)
    return BodyMeasurementRangeResponse(
        start=start_day,
        end=end_day,
        items=[_response(row, row.date) for row in rows],
    )
