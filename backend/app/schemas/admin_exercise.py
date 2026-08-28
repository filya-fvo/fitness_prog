"""Administrator exercise catalog contracts."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.exercise import ExerciseCreate, ExerciseResponse

MediaQuality = Literal["ready", "unverified", "missing", "rejected"]
MediaField = Literal["video_url", "animation_url", "thumbnail_url"]


class AdminExerciseItem(ExerciseResponse):
    media_quality: MediaQuality
    workout_uses: int = 0
    program_uses: int = 0


class AdminExerciseListResponse(BaseModel):
    items: list[AdminExerciseItem]
    total: int
    page: int
    page_size: int


class AdminExerciseOptions(BaseModel):
    muscle_groups: list[str]
    equipment: list[str]
    tags: list[str]


class ExerciseDuplicateCandidate(BaseModel):
    id: uuid.UUID
    name_ru: str
    similarity: float = Field(ge=0, le=1)


class ExerciseMediaCheckRequest(BaseModel):
    field: MediaField
    url: str = Field(min_length=1, max_length=2000)


class ExerciseMediaCheckResponse(BaseModel):
    field: MediaField
    url: str
    preview_url: str | None = None
    available: bool
    mime_type: str | None = None
    size_bytes: int | None = None
    status: Literal["ok", "warning", "error"]
    message: str


class ExercisePreflightRequest(ExerciseCreate):
    exclude_id: uuid.UUID | None = None


class ExercisePreflightResponse(BaseModel):
    valid: bool
    media: list[ExerciseMediaCheckResponse]
    duplicates: list[ExerciseDuplicateCandidate]
    errors: list[str]


class ExerciseImportPreviewRequest(BaseModel):
    items: list[dict[str, object]] = Field(min_length=1, max_length=500)


class ExerciseImportPreviewRow(BaseModel):
    row: int = Field(ge=1)
    name_ru: str | None = None
    valid: bool
    errors: list[str]
    duplicates: list[ExerciseDuplicateCandidate]


class ExerciseImportPreviewResponse(BaseModel):
    total: int
    valid: int
    invalid: int
    rows: list[ExerciseImportPreviewRow]


class ExerciseArchiveConflict(BaseModel):
    workout_uses: int
    program_uses: int
    message: str
