"""Schedule shift schemas."""

from __future__ import annotations

import uuid
from datetime import date, time
from typing import Optional

from pydantic import BaseModel, Field


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


class WorkoutScheduleOccurrence(BaseModel):
    original_date: date
    target_date: date
    start_time: time
    title: str
    program_id: uuid.UUID | None = None
    day_index: int | None = None
    status: str = Field(pattern=r"^(scheduled|moved|missed)$")
    is_override: bool = False
    can_reschedule: bool = False
    reschedule_until: date | None = None


class WorkoutScheduleOverview(BaseModel):
    requested_date: date
    current: WorkoutScheduleOccurrence | None = None
    next: WorkoutScheduleOccurrence | None = None
