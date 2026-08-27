"""Schemas for daily sleep and movement entries."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, model_validator


class DailyMetricUpdate(BaseModel):
    sleep_minutes: int | None = Field(default=None, ge=0, le=1440)
    steps: int | None = Field(default=None, ge=0, le=200_000)
    active_minutes: int | None = Field(default=None, ge=0, le=1440)
    # Transitional input for already cached PWA/Telegram bundles. It is ignored
    # and can be removed after the retained release window has elapsed.
    weight_kg: float | None = Field(default=None, ge=20, le=500, deprecated=True)

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "DailyMetricUpdate":
        if not self.model_fields_set.difference({"weight_kg"}):
            raise ValueError("at least one metric must be provided")
        return self


class DailyMetricResponse(BaseModel):
    id: uuid.UUID | None = None
    date: date
    sleep_minutes: int | None = None
    steps: int | None = None
    active_minutes: int | None = None
    # Older cached clients require the key to exist. New clients ignore it.
    weight_kg: None = Field(default=None, deprecated=True)
    sources: dict[str, str] = Field(default_factory=dict)


class DailyMetricRangeResponse(BaseModel):
    start: date
    end: date
    days: list[DailyMetricResponse]
