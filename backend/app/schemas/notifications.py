"""Notification request/response schemas."""

from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field


class ReminderRequest(BaseModel):
    workout_id: uuid.UUID
    title: Optional[str] = Field(default="Напоминание о тренировке")
    # If true and Redis/arq available — enqueue; else send inline
    enqueue: bool = True


class ReminderResponse(BaseModel):
    ok: bool
    mode: str  # inline | queued | dry_run
    detail: Optional[str] = None


class TimerNotifyRequest(BaseModel):
    """Immediate bot ping when rest/hold timer ends in Mini App."""

    kind: str = Field(default="rest", pattern=r"^(rest|hold)$")
    title: str | None = Field(default=None, max_length=120)
    text: str = Field(..., min_length=1, max_length=500)
    startapp: str | None = Field(default="home", max_length=80)
    workout_id: uuid.UUID | None = None


class TimerNotifyResponse(BaseModel):
    ok: bool
    detail: str | None = None


class TimerScheduleRequest(BaseModel):
    seconds: int = Field(..., ge=1, le=3600)
    title: str = Field(default="Отдых завершён", min_length=1, max_length=120)
    text: str = Field(..., min_length=1, max_length=500)
    workout_id: uuid.UUID | None = None

