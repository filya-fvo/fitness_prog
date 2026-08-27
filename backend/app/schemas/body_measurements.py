"""Schemas for dated body measurements."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, model_validator

MEASUREMENT_FIELDS = (
    "weight_kg",
    "neck_cm",
    "shoulders_cm",
    "chest_cm",
    "waist_cm",
    "hips_cm",
    "bicep_cm",
    "thigh_cm",
    "calf_cm",
)


class BodyMeasurementUpdate(BaseModel):
    weight_kg: float | None = Field(default=None, ge=20, le=500)
    neck_cm: float | None = Field(default=None, ge=1, le=500)
    shoulders_cm: float | None = Field(default=None, ge=1, le=500)
    chest_cm: float | None = Field(default=None, ge=1, le=500)
    waist_cm: float | None = Field(default=None, ge=1, le=500)
    hips_cm: float | None = Field(default=None, ge=1, le=500)
    bicep_cm: float | None = Field(default=None, ge=1, le=500)
    thigh_cm: float | None = Field(default=None, ge=1, le=500)
    calf_cm: float | None = Field(default=None, ge=1, le=500)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def require_value(self) -> "BodyMeasurementUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        return self


class BodyMeasurementResponse(BaseModel):
    id: uuid.UUID | None = None
    date: date
    weight_kg: float | None = None
    neck_cm: float | None = None
    shoulders_cm: float | None = None
    chest_cm: float | None = None
    waist_cm: float | None = None
    hips_cm: float | None = None
    bicep_cm: float | None = None
    thigh_cm: float | None = None
    calf_cm: float | None = None
    note: str | None = None
    sources: dict[str, str] = Field(default_factory=dict)


class BodyMeasurementRangeResponse(BaseModel):
    start: date
    end: date
    items: list[BodyMeasurementResponse]
