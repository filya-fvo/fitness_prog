"""Schedule shift schemas."""

from __future__ import annotations

import uuid
from datetime import date
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
