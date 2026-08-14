"""Workout instance routes (API contract)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.scheduler import ShiftScheduleRequest, ShiftScheduleResponse, SkipWorkoutRequest
from app.schemas.workout import (
    WorkoutCompleteRequest,
    WorkoutCreate,
    WorkoutHistoryResponse,
    WorkoutPlan,
    WorkoutResponse,
    WorkoutSetCreate,
    WorkoutSetResponse,
    WorkoutUpdateRequest,
)
from app.services import scheduler as scheduler_service
from app.services import workout_service

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.post("", response_model=WorkoutResponse, status_code=status.HTTP_201_CREATED)
async def create_workout(
    body: WorkoutCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutResponse:
    workout = await workout_service.create_workout(session, user, body)
    return WorkoutResponse.model_validate(workout)


@router.get("/history", response_model=WorkoutHistoryResponse)
async def workout_history(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutHistoryResponse:
    items, total = await workout_service.list_workout_history(
        session,
        user,
        date_from=date_from,
        date_to=date_to,
    )
    return WorkoutHistoryResponse(
        items=[WorkoutResponse.model_validate(item) for item in items],
        total=total,
    )


@router.post("/schedule/shift", response_model=ShiftScheduleResponse)
async def shift_schedule(
    body: ShiftScheduleRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ShiftScheduleResponse:
    """Shift all planned workouts from a date by N days."""
    items = await scheduler_service.shift_future_workouts(
        session,
        user,
        from_date=body.from_date,
        days=body.days,
    )
    return ShiftScheduleResponse(
        shifted=len(items),
        workout_ids=[item.id for item in items],
    )


@router.get("/{workout_id}", response_model=WorkoutResponse)
async def get_workout(
    workout_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutResponse:
    workout = await workout_service.get_workout(session, user, workout_id)
    return WorkoutResponse.model_validate(workout)


@router.patch("/{workout_id}", response_model=WorkoutResponse)
async def update_workout(
    workout_id: uuid.UUID,
    body: WorkoutUpdateRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutResponse:
    workout = await workout_service.update_workout(session, user, workout_id, body)
    return WorkoutResponse.model_validate(workout)


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await workout_service.delete_workout(session, user, workout_id)


@router.put("/{workout_id}/plan", response_model=WorkoutResponse)
async def update_workout_plan(
    workout_id: uuid.UUID,
    body: WorkoutPlan,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutResponse:
    workout = await workout_service.update_workout_plan(session, user, workout_id, body)
    return WorkoutResponse.model_validate(workout)


@router.put("/{workout_id}/complete", response_model=WorkoutResponse)
async def complete_workout(
    workout_id: uuid.UUID,
    body: WorkoutCompleteRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutResponse:
    workout = await workout_service.complete_workout(session, user, workout_id, body)
    return WorkoutResponse.model_validate(workout)


@router.post("/{workout_id}/skip", response_model=WorkoutResponse)
async def skip_workout(
    workout_id: uuid.UUID,
    body: SkipWorkoutRequest | None = None,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutResponse:
    """Mark workout skipped and shift later planned sessions (TZ §6)."""
    payload = body or SkipWorkoutRequest()
    workout = await scheduler_service.mark_skipped_and_shift(
        session,
        user,
        workout_id,
        shift_days=payload.shift_days,
    )
    return WorkoutResponse.model_validate(workout)


@router.post(
    "/{workout_id}/sets",
    response_model=WorkoutSetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_set(
    workout_id: uuid.UUID,
    body: WorkoutSetCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSetResponse:
    workout_set = await workout_service.add_workout_set(session, user, workout_id, body)
    return WorkoutSetResponse.model_validate(workout_set)
