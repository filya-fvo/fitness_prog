"""Shared bounded contracts for structured workout plans and recorded parts."""
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


def validate_weights(kind, weights):
    known = [weight for weight in weights if weight is not None]
    if kind == "cluster" and len(set(known)) > 1:
        raise ValueError("Вес частей кластера должен совпадать")
    if kind == "drop" and any(a <= b for a, b in zip(known, known[1:])):
        raise ValueError("В дроп-сете вес каждой следующей части должен снижаться")


class WorkoutMethodTarget(StrictModel):
    target_reps: int = Field(ge=1, le=100_000)
    target_weight: Decimal | None = Field(default=None, gt=0, le=10_000, decimal_places=2)
    pause_after_sec: int = Field(default=0, ge=0, le=600)


class WorkoutSetMethod(StrictModel):
    set_number: int = Field(ge=1, le=20)
    kind: Literal["drop", "cluster"]
    parts: list[WorkoutMethodTarget] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def validate_method(self):
        validate_weights(self.kind, [part.target_weight for part in self.parts])
        if self.parts[-1].pause_after_sec:
            raise ValueError("После последней части отдых задаётся для подхода или связки")
        return self


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


class WorkoutExecutionPart(StrictModel):
    id: UUID
    ordinal: int = Field(ge=1, le=8)
    reps: int | None = Field(default=None, ge=0, le=100_000)
    weight: Decimal | None = Field(default=None, gt=0, le=10_000, decimal_places=2)
    duration_sec: int | None = Field(default=None, ge=0, le=86400)
    status: Literal["pending", "completed", "skipped"] = "pending"
    rest_after_sec: int = Field(default=0, ge=0, le=600)

    @model_validator(mode="after")
    def validate_completed(self):
        if self.status == "completed" and (not self.reps or not self.weight):
            raise ValueError("Укажите повторы и рабочий вес выполненной части")
        return self


class WorkoutExecutionPartResponse(WorkoutExecutionPart):
    created_at: datetime
    updated_at: datetime
