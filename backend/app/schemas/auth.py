"""Auth request/response schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class TelegramAuthRequest(BaseModel):
    """Body for POST /auth/telegram."""

    init_data: str = Field(..., min_length=1, description="Raw Telegram WebApp initData string")


class AuthUserResponse(BaseModel):
    """Public user fields returned after auth."""

    id: uuid.UUID
    telegram_id: int
    username: str | None = None
    subscription_status: str
    onboarding_completed: bool = False

    model_config = {"from_attributes": True}


class TelegramAuthResponse(BaseModel):
    """JWT session + user profile."""

    access_token: str
    token_type: str = "bearer"
    expires_in_days: int
    user: AuthUserResponse
