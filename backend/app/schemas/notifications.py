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
