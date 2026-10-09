"""Read-only, bounded plans prepared for a local diary."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.program import ProgramResponse
from app.schemas.scheduler import WorkoutScheduleOverview
from app.schemas.workout import WorkoutPlan


class OfflineWorkoutDay(BaseModel):
    requested_date: date
    schedule: WorkoutScheduleOverview


class PreparedProgramPlan(BaseModel):
    scheduled_date: date
    day_index: int = Field(ge=1, le=7)
    week_phase: Literal["light", "medium", "heavy"]
    readiness: Literal["normal", "caution", "reduce", "rest"]
    plan: WorkoutPlan


class OfflineWorkoutContext(BaseModel):
    version: Literal[1] = 1
    owner: UUID
    prepared_at: datetime
    start: date
    end: date
    program: ProgramResponse | None = None
    days: list[OfflineWorkoutDay] = Field(max_length=14)
    plans: list[PreparedProgramPlan] = Field(default_factory=list, max_length=1764)
