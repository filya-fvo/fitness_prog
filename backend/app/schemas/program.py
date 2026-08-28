"""Program request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProgramCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    target_level: str | None = None
    duration_weeks: int | None = Field(default=None, gt=0)
    structure: dict[str, Any] = Field(default_factory=dict)
    workout_type: str = "custom"
    level: str | None = None
    is_template: bool = True


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
    created_at: datetime
    updated_at: datetime


class ProgramStartRequest(BaseModel):
    day_index: int = Field(default=1, ge=1)
    scheduled_date: date | None = None
    # Optional manual override for 3-week cycle (light|medium|heavy)
    week_phase: str | None = Field(default=None, pattern=r'^(light|medium|heavy)$')


class ProgramListResponse(BaseModel):
    items: list[ProgramResponse]
    total: int


class ProgramPublicationResponse(BaseModel):
    program: ProgramResponse
    message: str
