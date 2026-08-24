"""Workout instance routes (API contract)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.scheduler import (
    ShiftScheduleRequest,
    ShiftScheduleResponse,
    SkipWorkoutRequest,
    WorkoutRescheduleRequest,
    WorkoutScheduleOverview,
)
from app.schemas.workout import (
    PlannedWorkoutPlanRequest,
    WorkoutCompleteRequest,
    WorkoutCreate,
    WorkoutHistoryResponse,
    WorkoutPlan,
    WorkoutResponse,
    WorkoutSetCreate,
    WorkoutSetResponse,
    WorkoutUpdateRequest,
)
from app.services import planned_workout
from app.services import scheduler as scheduler_service
from app.services import workout_shift
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
    items = await workout_shift.shift_future_workouts(
        session,
        user,
        from_date=body.from_date,
        days=body.days,
    )
    return ShiftScheduleResponse(
        shifted=len(items),
        workout_ids=[item.id for item in items],
    )


@router.get("/schedule/overview", response_model=WorkoutScheduleOverview)
async def workout_schedule_overview(
    day: date | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutScheduleOverview:
    overview = await scheduler_service.get_schedule_overview(
        session,
        user,
        day or scheduler_service.local_schedule_day(user.goals or {}),
    )
    return WorkoutScheduleOverview.model_validate(overview)


@router.post("/schedule/reschedule", response_model=WorkoutScheduleOverview)
async def reschedule_workout_occurrence(
    body: WorkoutRescheduleRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutScheduleOverview:
    overview = await scheduler_service.reschedule_workout_occurrence(
        session,
        user,
        original_date=body.original_date,
        target_date=body.target_date,
        target_time=body.target_time,
    )
    return WorkoutScheduleOverview.model_validate(overview)


@router.get("/planned-plan", response_model=WorkoutPlan)
async def planned_workout_plan(
    program_id: uuid.UUID,
    scheduled_date: date,
    day_index: int = Query(..., ge=1),
    week_phase: str | None = Query(default=None, pattern=r"^(light|medium|heavy)$"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutPlan:
    plan = await workout_service.preview_program_plan(
        session,
        user,
        program_id=program_id,
        day_index=day_index,
        scheduled_date=scheduled_date,
        week_phase=week_phase,
    )
    return WorkoutPlan.model_validate(plan)


@router.put("/planned-plan", response_model=WorkoutPlan)
async def save_planned_workout_plan(
    body: PlannedWorkoutPlanRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutPlan:
    base_plan = await workout_service.preview_program_plan(
        session,
        user,
        program_id=body.program_id,
        day_index=body.day_index,
        scheduled_date=body.scheduled_date,
        week_phase=body.week_phase,
        include_saved_override=False,
    )
    plan = await planned_workout.save_override(
        session,
        user_id=user.id,
        program_id=body.program_id,
        scheduled_date=body.scheduled_date,
        day_index=body.day_index,
        week_phase=body.week_phase,
        base_plan=base_plan,
        replacements=body.replacements,
    )
    return WorkoutPlan.model_validate(plan)


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
    workout = await workout_shift.mark_skipped_and_shift(
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
