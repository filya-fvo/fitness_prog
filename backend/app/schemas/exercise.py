"""Exercise request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExerciseCreate(BaseModel):
    name_ru: str = Field(..., min_length=1, max_length=200)
    muscle_group: str = Field(..., min_length=1, max_length=100)
    equipment: str | None = None
    description: str | None = None
    technique: str | None = None
    common_mistakes: str | None = None
    difficulty: int = Field(default=1, ge=1, le=5)
    video_url: str | None = None
    animation_url: str | None = None
    thumbnail_url: str | None = None
    media_duration_sec: int | None = Field(default=None, ge=0)
    media_source: str = Field(default="none")
    tags: list[str] = Field(default_factory=list)


class ExerciseUpdate(BaseModel):
    name_ru: str | None = Field(default=None, min_length=1, max_length=200)
    muscle_group: str | None = Field(default=None, min_length=1, max_length=100)
    equipment: str | None = None
    description: str | None = None
    technique: str | None = None
    common_mistakes: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    video_url: str | None = None
    animation_url: str | None = None
    thumbnail_url: str | None = None
    media_duration_sec: int | None = Field(default=None, ge=0)
    media_source: str | None = None
    tags: list[str] | None = None


class ExerciseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_ru: str
    muscle_group: str
    equipment: str | None = None
    description: str | None = None
    technique: str | None = None
    common_mistakes: str | None = None
    difficulty: int
    video_url: str | None = None
    animation_url: str | None = None
    thumbnail_url: str | None = None
    media_duration_sec: int | None = None
    media_source: str = "none"
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ExerciseListResponse(BaseModel):
    items: list[ExerciseResponse]
    total: int
    page: int
    page_size: int
