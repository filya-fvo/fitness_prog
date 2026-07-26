"""User profile schemas (GET/PUT /users/me)."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field


class UserProfileResponse(BaseModel):
    id: uuid.UUID
    telegram_id: int | None = None
    username: str | None = None
    auth_email: str | None = None
    anthropometry: dict[str, Any] = Field(default_factory=dict)
    goals: dict[str, Any] = Field(default_factory=dict)
    subscription_status: str
    stars_balance: int = 0
    onboarding_completed: bool = False

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    """Partial profile update from onboarding / settings."""

    anthropometry: dict[str, Any] | None = None
    goals: dict[str, Any] | None = None
    auth_email: str | None = None
