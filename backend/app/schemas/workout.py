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


class WorkoutPlan(BaseModel):
    title: str | None = None
    workout_type: str | None = None
    exercises: list[WorkoutPlanExercise] = Field(default_factory=list)


class WorkoutCreate(BaseModel):
    scheduled_date: date
    program_id: uuid.UUID | None = None
    day_index: int | None = Field(default=None, ge=1)
    title: str | None = None
    workout_type: str | None = None
    exercise_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description="Optional exercises to pre-create empty set slots for",
    )
    plan: WorkoutPlan | None = None
    sets_per_exercise: int = Field(default=3, ge=1, le=10)


class WorkoutCompleteRequest(BaseModel):
    rpe: int | None = Field(default=None, ge=1, le=10)
    ai_notes: str | None = None


class WorkoutSetCreate(BaseModel):
    exercise_id: uuid.UUID
    set_number: int = Field(..., gt=0)
    reps: int | None = Field(default=None, ge=0)
    weight: Decimal | None = Field(default=None, ge=0)
    rest_time_sec: int | None = Field(default=None, ge=0)
    is_completed: bool = False


class WorkoutSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workout_id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    reps: int | None = None
    weight: Decimal | None = None
    is_completed: bool
    rest_time_sec: int | None = None
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
