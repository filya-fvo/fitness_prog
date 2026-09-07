"""Schedule shift schemas."""

from __future__ import annotations

import uuid
from datetime import date, time
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ShiftScheduleRequest(BaseModel):
    from_date: Optional[date] = None
    days: int = Field(default=1, ge=0, le=30)


class SkipWorkoutRequest(BaseModel):
    shift_days: int = Field(default=1, ge=0, le=30)


class ShiftScheduleResponse(BaseModel):
    shifted: int
    workout_ids: list[uuid.UUID]


class WorkoutRescheduleRequest(BaseModel):
    """Move one occurrence without changing the recurring weekly schedule."""

    original_date: date
    target_date: date
    target_time: time


class WorkoutCancellationRequest(BaseModel):
    """Cancel one effective occurrence without advancing the program cursor."""

    scheduled_date: date


class WorkoutScheduleSettingsUpdate(BaseModel):
    days: list[int] = Field(min_length=1, max_length=7)
    start_time: time

    @field_validator("days")
    @classmethod
    def validate_days(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("weekday must be between 0 and 6")
        if len(set(value)) != len(value):
            raise ValueError("weekdays must be unique")
        return sorted(value)


class WorkoutScheduleSettingsResponse(BaseModel):
    version: Literal[1] = 1
    days: list[int]
    start_time: time


class WorkoutScheduleOccurrence(BaseModel):
    original_date: date
    target_date: date
    start_time: time
    title: str
    program_id: uuid.UUID | None = None
    day_index: int | None = None
    status: str = Field(pattern=r"^(scheduled|moved|missed|completed|cancelled)$")
    is_override: bool = False
    can_reschedule: bool = False
    reschedule_until: date | None = None
    can_cancel: bool = False
    cancel_to: date | None = None


class WorkoutScheduleOverview(BaseModel):
    requested_date: date
    current: WorkoutScheduleOccurrence | None = None
    next: WorkoutScheduleOccurrence | None = None


class PersonalRegularityResponse(BaseModel):
    period_start: date
    period_end: date
    has_schedule: bool
    completed: int = Field(ge=0)
    planned: int = Field(ge=0)
    rescheduled_completed: int = Field(ge=0)
    cancelled: int = Field(ge=0)
    missed: int = Field(ge=0)
    completion_pct: float | None = Field(default=None, ge=0, le=100)
