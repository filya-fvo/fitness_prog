"""Admin API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AdminUserRow(BaseModel):
    id: uuid.UUID
    telegram_id: int | None = None
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    display_name: str
    auth_email: str | None = None
    subscription_status: str = "free"
    onboarding_completed: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    workouts_count: int = 0
    completed_workouts: int = 0
    has_water_log: bool = False
    primary_goal: str | None = None
    level: str | None = None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserRow]
    total: int


class AdminActionResponse(BaseModel):
    ok: bool = True
    user_id: uuid.UUID
    action: str
    notified: bool = False
    detail: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
