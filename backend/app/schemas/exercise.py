"""Exercise request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _clean_values(values: list[str]) -> list[str]:
    cleaned = list(dict.fromkeys(value.strip() for value in values if value.strip()))
    if any(len(value) > 100 for value in cleaned):
        raise ValueError("Значение списка не должно превышать 100 символов")
    return cleaned


class ExerciseCreate(BaseModel):
    name_ru: str = Field(..., min_length=1, max_length=200)
    muscle_group: str = Field(..., min_length=1, max_length=100)
    secondary_muscle_groups: list[str] = Field(default_factory=list, max_length=20)
    equipment: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=4000)
    technique: str | None = Field(default=None, max_length=8000)
    common_mistakes: str | None = Field(default=None, max_length=4000)
    difficulty: int = Field(default=1, ge=1, le=5)
    video_url: str | None = Field(default=None, max_length=2000)
    animation_url: str | None = Field(default=None, max_length=2000)
    thumbnail_url: str | None = Field(default=None, max_length=2000)
    media_duration_sec: int | None = Field(default=None, ge=0, le=86400)
    media_source: Literal["youtube", "external", "none"] = "none"
    tags: list[str] = Field(default_factory=list, max_length=40)
    limitations: list[str] = Field(default_factory=list, max_length=30)
    weight_rule: Literal["total", "per_hand", "per_side", "none"] = "total"

    @field_validator("name_ru", "muscle_group")
    @classmethod
    def clean_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Поле не должно быть пустым")
        return cleaned

    @field_validator("secondary_muscle_groups", "tags", "limitations")
    @classmethod
    def clean_list_values(cls, values: list[str]) -> list[str]:
        return _clean_values(values)


class ExerciseUpdate(BaseModel):
    name_ru: str | None = Field(default=None, min_length=1, max_length=200)
    muscle_group: str | None = Field(default=None, min_length=1, max_length=100)
    secondary_muscle_groups: list[str] | None = Field(default=None, max_length=20)
    equipment: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=4000)
    technique: str | None = Field(default=None, max_length=8000)
    common_mistakes: str | None = Field(default=None, max_length=4000)
    difficulty: int | None = Field(default=None, ge=1, le=5)
    video_url: str | None = Field(default=None, max_length=2000)
    animation_url: str | None = Field(default=None, max_length=2000)
    thumbnail_url: str | None = Field(default=None, max_length=2000)
    media_duration_sec: int | None = Field(default=None, ge=0, le=86400)
    media_source: Literal["youtube", "external", "none"] | None = None
    tags: list[str] | None = Field(default=None, max_length=40)
    limitations: list[str] | None = Field(default=None, max_length=30)
    weight_rule: Literal["total", "per_hand", "per_side", "none"] | None = None

    @field_validator("name_ru", "muscle_group")
    @classmethod
    def clean_optional_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Поле не должно быть пустым")
        return cleaned

    @field_validator("secondary_muscle_groups", "tags", "limitations")
    @classmethod
    def clean_optional_list_values(cls, values: list[str] | None) -> list[str] | None:
        return None if values is None else _clean_values(values)


class ExerciseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_ru: str
    muscle_group: str
    secondary_muscle_groups: list[str] = Field(default_factory=list)
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
    limitations: list[str] = Field(default_factory=list)
    weight_rule: Literal["total", "per_hand", "per_side", "none"] = "total"
    created_at: datetime
    updated_at: datetime


class ExerciseListResponse(BaseModel):
    items: list[ExerciseResponse]
    total: int
    page: int
    page_size: int
