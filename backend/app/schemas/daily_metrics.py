"""Schemas for daily sleep, movement and weight entries."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, model_validator


class DailyMetricUpdate(BaseModel):
    sleep_minutes: int | None = Field(default=None, ge=0, le=1440)
    steps: int | None = Field(default=None, ge=0, le=200_000)
    active_minutes: int | None = Field(default=None, ge=0, le=1440)
    weight_kg: float | None = Field(default=None, ge=20, le=500)

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "DailyMetricUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one metric must be provided")
        return self


class DailyMetricResponse(BaseModel):
    id: uuid.UUID | None = None
    date: date
    sleep_minutes: int | None = None
    steps: int | None = None
    active_minutes: int | None = None
    weight_kg: float | None = None
    sources: dict[str, str] = Field(default_factory=dict)


class DailyMetricRangeResponse(BaseModel):
    start: date
    end: date
    days: list[DailyMetricResponse]
