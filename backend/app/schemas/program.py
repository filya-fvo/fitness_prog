"""Program request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProgramCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    target_level: str | None = None
    duration_weeks: int | None = Field(default=None, gt=0)
    structure: dict[str, Any] = Field(default_factory=dict)
    workout_type: str = "custom"
    level: str | None = None
    is_template: bool = True


class PersonalProgramExercise(BaseModel):
    exercise_id: uuid.UUID
    sets: int = Field(ge=1, le=8)
    reps: str = Field(min_length=1, max_length=20, pattern=r"^[0-9\-–сs ]+$")
    rest_sec: int = Field(default=60, ge=15, le=300)

    @field_validator("reps")
    @classmethod
    def validate_reps(cls, value: str) -> str:
        value = value.strip()
        if not any(character.isdigit() for character in value):
            raise ValueError("Укажите число повторений")
        return value


class PersonalProgramDay(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    exercises: list[PersonalProgramExercise] = Field(min_length=1, max_length=12)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Укажите название дня")
        return value


class PersonalProgramCreate(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    location: Literal["gym", "home", "outdoor"]
    progression: Literal["linear", "phased"] = "phased"
    duration_weeks: int = Field(default=8, ge=1, le=52)
    days: list[PersonalProgramDay] = Field(min_length=1, max_length=7)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Название программы слишком короткое")
        return value


class ProgramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    target_level: str | None = None
    duration_weeks: int | None = Field(default=None, gt=0)
    structure: dict[str, Any] | None = None
    workout_type: str | None = None
    level: str | None = None
    is_template: bool | None = None


class ProgramResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    target_level: str | None = None
    duration_weeks: int | None = None
    structure: dict[str, Any]
    workout_type: str = "custom"
    level: str | None = None
    is_template: bool = True
    publication_status: str = "draft"
    program_key: str
    version: int = 1
    is_current: bool = False
    published_at: datetime | None = None
    published_by: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    personal_duration_min: int | None = Field(default=None, ge=5, le=240)
    personal_duration_sample_size: int = Field(default=0, ge=0, le=6)
    created_at: datetime
    updated_at: datetime


class ProgramStartRequest(BaseModel):
    day_index: int = Field(default=1, ge=1)
    scheduled_date: date | None = None
    # Optional manual override for 3-week cycle (light|medium|heavy)
    week_phase: str | None = Field(default=None, pattern=r'^(light|medium|heavy)$')
    cycle_readiness: Literal["normal", "caution", "reduce", "rest"] | None = None


class ProgramListResponse(BaseModel):
    items: list[ProgramResponse]
    total: int


class ProgramPublicationResponse(BaseModel):
    program: ProgramResponse
    message: str
