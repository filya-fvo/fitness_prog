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


class AddedExerciseDefaults(BaseModel):
    target_reps: str = Field(min_length=1, max_length=30)
    rest_sec: int = Field(ge=0, le=600)


class PreparedProgramPlan(BaseModel):
    exercise_defaults: AddedExerciseDefaults | None = None
    scheduled_date: date
    day_index: int = Field(ge=1, le=7)
    week_phase: Literal["light", "medium", "heavy"]
    readiness: Literal["normal", "caution", "reduce", "rest"]
    after_recovery: bool = False
    preparation_fingerprint: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    plan: WorkoutPlan


class OfflineWorkoutContext(BaseModel):
    version: Literal[1] = 1
    owner: UUID
    prepared_at: datetime
    schedule_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    start: date
    end: date
    program: ProgramResponse | None = None
    days: list[OfflineWorkoutDay] = Field(max_length=14)
    plans: list[PreparedProgramPlan] = Field(default_factory=list, max_length=3528)
