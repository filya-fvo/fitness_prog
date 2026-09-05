"""Workout and set request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class WorkoutPlanExercise(BaseModel):
    exercise_id: uuid.UUID
    order: int = Field(..., ge=1)
    target_sets: int = Field(default=3, ge=1, le=20)
    target_reps: str | None = "8-12"
    rest_sec: int = Field(default=60, ge=0, le=600)
    name_ru: str | None = None
    suggested_weight: Decimal | None = Field(default=None, ge=0)
    original_exercise_id: uuid.UUID | None = None
    weight_mode: str | None = Field(default=None, pattern=r"^(total|per_hand)$")
    note: str | None = Field(default=None, max_length=500)


class WorkoutPlan(BaseModel):
    title: str | None = None
    workout_type: str | None = None
    day_index: int | None = None
    week_phase: str | None = None  # light | medium | heavy
    week_in_cycle: int | None = None
    week_label: str | None = None
    week_rir: str | None = None
    location: str | None = None
    equipment: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    exercises: list[WorkoutPlanExercise] = Field(default_factory=list)


class WorkoutCreate(BaseModel):
    scheduled_date: date
    client_workout_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    day_index: int | None = Field(default=None, ge=1)
    week_phase: str | None = Field(default=None, pattern=r"^(light|medium|heavy)$")
    title: str | None = None
    workout_type: str | None = None
    exercise_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description="Optional exercises to pre-create empty set slots for",
    )
    plan: WorkoutPlan | None = None
    sets_per_exercise: int = Field(default=3, ge=1, le=10)


class PlannedWorkoutReplacement(BaseModel):
    from_exercise_id: uuid.UUID
    to_exercise_id: uuid.UUID


class PlannedWorkoutPlanRequest(BaseModel):
    program_id: uuid.UUID
    scheduled_date: date
    day_index: int = Field(..., ge=1)
    week_phase: str | None = Field(default=None, pattern=r"^(light|medium|heavy)$")
    replacements: list[PlannedWorkoutReplacement] = Field(default_factory=list, max_length=50)


class WorkoutCompleteRequest(BaseModel):
    rpe: int | None = Field(default=None, ge=1, le=10)
    ai_notes: str | None = None


class WorkoutUpdateRequest(BaseModel):
    """Editable summary fields for an existing workout."""

    rpe: int | None = Field(default=None, ge=1, le=10)
    ai_notes: str | None = Field(default=None, max_length=5000)


class WorkoutSetCreate(BaseModel):
    exercise_id: uuid.UUID
    set_number: int = Field(..., gt=0)
    reps: int | None = Field(default=None, ge=0, le=100_000)
    weight: Decimal | None = Field(default=None, ge=0, le=10_000)
    weight_mode: str | None = Field(default=None, pattern=r"^(total|per_hand)$")
    rest_time_sec: int | None = Field(default=None, ge=0, le=3600)
    duration_sec: int | None = Field(default=None, ge=0, le=86400)
    note: str | None = Field(default=None, max_length=1000)
    machine_params: dict[str, str | int | float] | None = None
    is_completed: bool = False


class WorkoutSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workout_id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    reps: int | None = None
    weight: Decimal | None = None
    weight_mode: str | None = None
    is_completed: bool
    rest_time_sec: int | None = None
    duration_sec: int | None = None
    note: str | None = None
    machine_params: dict[str, str | int | float] | None = None
    created_at: datetime
    updated_at: datetime


class WorkoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    program_id: uuid.UUID | None = None
    scheduled_date: date
    status: str
    ai_notes: str | None = None
    rpe: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    title: str | None = None
    workout_type: str | None = None
    plan: dict = Field(default_factory=dict)
    duration_sec: int | None = None
    created_at: datetime
    updated_at: datetime
    sets: list[WorkoutSetResponse] = Field(default_factory=list)


class WorkoutHistoryResponse(BaseModel):
    items: list[WorkoutResponse]
    total: int
