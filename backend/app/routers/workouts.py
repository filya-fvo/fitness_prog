"""Workout instance routes (API contract)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import (
    get_current_user,
    raise_plus_required,
    require_plus,
    user_has_plus,
    user_local_day,
)
from app.models.user import User
from app.schemas.scheduler import (
    PersonalRegularityResponse,
    ShiftScheduleRequest,
    ShiftScheduleResponse,
    SkipWorkoutRequest,
    WorkoutCancellationRequest,
    WorkoutReschedulePreview,
    WorkoutReschedulePreviewRequest,
    WorkoutRescheduleRequest,
    WorkoutScheduleOverview,
    WorkoutScheduleReplacementPreview,
    WorkoutScheduleReplacementPreviewRequest,
    WorkoutScheduleReplacementRequest,
    WorkoutScheduleReplacementResponse,
    WorkoutScheduleSettingsResponse,
    WorkoutScheduleSettingsUpdate,
)
from app.schemas.workout import (
    ExerciseProgressResponse,
    PlannedWorkoutPlanRequest,
    WorkoutCompleteRequest,
    WorkoutCreate,
    WorkoutHistoryResponse,
    WorkoutLoadHint,
    WorkoutLoadHintsRequest,
    WorkoutLoadHintsResponse,
    WorkoutPlan,
    WorkoutResponse,
    WorkoutSetCreate,
    WorkoutSetResponse,
    WorkoutUpdateRequest,
)
from app.services import (
    exercise_progress,
    personal_regularity,
    planned_workout,
    schedule_replacement,
    workout_reschedule,
)
from app.services import scheduler as scheduler_service
from app.services import workout_shift
from app.services import workout_load_hints
from app.services import workout_service

router = APIRouter(prefix="/workouts", tags=["workouts"])

_WORKOUT_HISTORY_MESSAGE = "История тренировок доступна в PLUS"
_WORKOUT_DETAILS_MESSAGE = "Прошлые тренировки доступны в PLUS"
_EXERCISE_HISTORY_MESSAGE = "Динамика упражнения доступна в PLUS"


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
    user: User = Depends(require_plus("workout_history", _WORKOUT_HISTORY_MESSAGE)),
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


@router.post("/load-hints", response_model=WorkoutLoadHintsResponse)
async def workout_load_hint_list(
    body: WorkoutLoadHintsRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutLoadHintsResponse:
    rows = await workout_load_hints.load_hints_for_exercises(
        session,
        user_id=user.id,
        exercise_ids=body.exercise_ids,
    )
    return WorkoutLoadHintsResponse(
        items=[WorkoutLoadHint.model_validate(row) for row in rows],
    )


@router.get(
    "/exercises/{exercise_id}/progress",
    response_model=ExerciseProgressResponse,
)
async def exercise_progress_summary(
    exercise_id: uuid.UUID,
    period_days: int = Query(default=365, ge=7, le=366),
    phase: Literal["all", "light", "medium", "heavy"] = Query(default="all"),
    diary_limit: int = Query(default=1, ge=1, le=25),
    diary_cursor: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_plus("exercise_history", _EXERCISE_HISTORY_MESSAGE)),
) -> ExerciseProgressResponse:
    period_end = user_local_day(user)
    result = await exercise_progress.get_exercise_progress(
        session,
        user_id=user.id,
        exercise_id=exercise_id,
        date_from=period_end - timedelta(days=period_days - 1),
        date_to=period_end,
        phase=phase,
        diary_limit=diary_limit,
        diary_cursor=diary_cursor,
    )
    return ExerciseProgressResponse.model_validate(result)


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


@router.get("/schedule/settings", response_model=WorkoutScheduleSettingsResponse)
async def workout_schedule_settings(
    user: User = Depends(get_current_user),
) -> WorkoutScheduleSettingsResponse:
    return WorkoutScheduleSettingsResponse.model_validate(
        scheduler_service.workout_schedule_settings(user.goals or {}),
    )


@router.put("/schedule/settings", response_model=WorkoutScheduleSettingsResponse)
async def save_workout_schedule_settings(
    body: WorkoutScheduleSettingsUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutScheduleSettingsResponse:
    settings = await scheduler_service.update_workout_schedule_settings(
        session,
        user,
        days=set(body.days),
        start_time=body.start_time,
    )
    return WorkoutScheduleSettingsResponse.model_validate(settings)


@router.post(
    "/schedule/replacement/preview",
    response_model=WorkoutScheduleReplacementPreview,
)
async def preview_workout_schedule_replacement(
    body: WorkoutScheduleReplacementPreviewRequest,
    user: User = Depends(get_current_user),
) -> WorkoutScheduleReplacementPreview:
    preview = schedule_replacement.preview_workout_schedule_replacement(
        user.goals or {},
        original_date=body.original_date,
        target_date=body.target_date,
        target_time=body.target_time,
        effective_scope=body.effective_scope,
        conflict_resolution=body.conflict_resolution,
        local_day=scheduler_service.local_schedule_day(user.goals or {}),
    )
    return WorkoutScheduleReplacementPreview.model_validate(preview)


@router.post(
    "/schedule/replacement",
    response_model=WorkoutScheduleReplacementResponse,
)
async def replace_workout_schedule_day(
    body: WorkoutScheduleReplacementRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutScheduleReplacementResponse:
    settings, overview, applied = await schedule_replacement.replace_recurring_workout_day(
        session,
        user,
        original_date=body.original_date,
        target_date=body.target_date,
        target_time=body.target_time,
        effective_scope=body.effective_scope,
        conflict_resolution=body.conflict_resolution,
        expected_revision=body.expected_revision,
        idempotency_key=body.idempotency_key,
    )
    return WorkoutScheduleReplacementResponse(
        settings=WorkoutScheduleSettingsResponse.model_validate(settings),
        overview=WorkoutScheduleOverview.model_validate(overview),
        applied=applied,
    )


@router.get("/regularity", response_model=PersonalRegularityResponse)
async def workout_regularity(
    days: int = Query(default=28, ge=7, le=366),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_plus("workout_regularity", "Регулярность тренировок доступна в PLUS")
    ),
) -> PersonalRegularityResponse:
    summary = await personal_regularity.personal_regularity_for_user(
        session,
        user,
        days=days,
    )
    return PersonalRegularityResponse.model_validate(summary, from_attributes=True)


@router.post("/schedule/reschedule", response_model=WorkoutScheduleOverview)
async def reschedule_workout_occurrence(
    body: WorkoutRescheduleRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutScheduleOverview:
    overview = await workout_reschedule.reschedule_workout_occurrence(
        session,
        user,
        original_date=body.original_date,
        target_date=body.target_date,
        target_time=body.target_time,
        conflict_resolution=body.conflict_resolution,
    )
    return WorkoutScheduleOverview.model_validate(overview)


@router.post("/schedule/reschedule/preview", response_model=WorkoutReschedulePreview)
async def preview_reschedule_workout_occurrence(
    body: WorkoutReschedulePreviewRequest,
    user: User = Depends(get_current_user),
) -> WorkoutReschedulePreview:
    preview = workout_reschedule.preview_workout_reschedule(
        user.goals or {},
        original_date=body.original_date,
        target_date=body.target_date,
        local_day=scheduler_service.local_schedule_day(user.goals or {}),
    )
    return WorkoutReschedulePreview.model_validate(preview)


@router.post("/schedule/cancel", response_model=WorkoutScheduleOverview)
async def cancel_workout_occurrence(
    body: WorkoutCancellationRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutScheduleOverview:
    overview = await scheduler_service.cancel_workout_occurrence(
        session,
        user,
        scheduled_date=body.scheduled_date,
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
    if await user_has_plus(session, user):
        workout = await workout_service.get_workout(session, user, workout_id)
    else:
        local_day = user_local_day(user)
        workout = await workout_service.get_operational_workout(
            session,
            user,
            workout_id,
            local_day=local_day,
        )
        if workout is None:
            raise_plus_required("workout_details", _WORKOUT_DETAILS_MESSAGE)
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
