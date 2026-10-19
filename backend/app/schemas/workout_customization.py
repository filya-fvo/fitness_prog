"""Typed, account-scoped changes to an existing program day."""
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AddedWorkoutExercise(StrictModel):
    exercise_id: UUID
    target_sets: int = Field(default=3, ge=1, le=20)
    target_reps: str | None = Field(default=None, min_length=1, max_length=30)
    rest_sec: int | None = Field(default=None, ge=0, le=600)
    weight_mode: Literal["total", "per_hand"] | None = None
    note: str | None = Field(default=None, max_length=500)


class WorkoutExerciseOverride(StrictModel):
    exercise_id: UUID
    replacement_exercise_id: UUID | None = None
    target_sets: int | None = Field(default=None, ge=1, le=20)
    target_reps: str | None = Field(default=None, min_length=1, max_length=30)
    rest_sec: int | None = Field(default=None, ge=0, le=600)
    note: str | None = Field(default=None, max_length=500)


class WorkoutGroup(StrictModel):
    id: UUID
    kind: Literal["superset", "triset", "circuit"]
    exercise_ids: list[UUID] = Field(min_length=2, max_length=20)
    rounds: int = Field(ge=1, le=20)
    transition_sec: int = Field(default=0, ge=0, le=600)
    round_rest_sec: int = Field(default=90, ge=0, le=600)

    @model_validator(mode="after")
    def validate_members(self):
        required = {"superset": 2, "triset": 3}.get(self.kind)
        if required is not None and len(self.exercise_ids) != required:
            raise ValueError("Неверное число упражнений в связке")
        if len(set(self.exercise_ids)) != len(self.exercise_ids):
            raise ValueError("Упражнения связки не должны повторяться")
        return self


class WorkoutDayPatch(StrictModel):
    added_exercises: list[AddedWorkoutExercise] = Field(default_factory=list, max_length=20)
    removed_exercise_ids: list[UUID] = Field(default_factory=list, max_length=20)
    exercise_overrides: list[WorkoutExerciseOverride] = Field(default_factory=list, max_length=20)
    exercise_order: list[UUID] | None = Field(default=None, min_length=1, max_length=20)
    groups: list[WorkoutGroup] | None = Field(default=None, max_length=10)

    @model_validator(mode="after")
    def validate_unique_ids(self):
        for ids in ([row.exercise_id for row in self.added_exercises], self.removed_exercise_ids,
                    [row.exercise_id for row in self.exercise_overrides], self.exercise_order or []):
            if len(set(ids)) != len(ids):
                raise ValueError("Упражнение нельзя добавить дважды")
        return self


class WorkoutCustomizationContext(StrictModel):
    program_id: UUID
    day_index: int = Field(ge=1, le=7)
    scope: Literal["occurrence", "program_day"]
    scheduled_date: date | None = None

    @model_validator(mode="after")
    def validate_scope(self):
        if (self.scope == "occurrence") != (self.scheduled_date is not None):
            raise ValueError("Для разового изменения нужна дата; для постоянного дата не задаётся")
        return self


class WorkoutCustomizationRequest(WorkoutCustomizationContext):
    base_revision: int = Field(ge=0)
    operation_id: UUID
    patch: WorkoutDayPatch = Field(default_factory=WorkoutDayPatch)


class WorkoutCustomizationResponse(WorkoutCustomizationContext):
    revision: int = Field(ge=0)
    program_version: int = Field(ge=1)
    patch: WorkoutDayPatch
