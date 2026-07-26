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
    telegram_id: int | None = None
    username: str | None = None
    auth_email: str | None = None
    subscription_status: str
    onboarding_completed: bool = False

    model_config = {"from_attributes": True}


class TelegramAuthResponse(BaseModel):
    """JWT session + user profile."""

    access_token: str
    token_type: str = "bearer"
    expires_in_days: int
    user: AuthUserResponse


class EmailOtpRequest(BaseModel):
    """Request a one-time code for login or email linking."""

    email: str = Field(..., min_length=3, max_length=320)


class EmailOtpVerifyRequest(BaseModel):
    """Verify a one-time code."""

    email: str = Field(..., min_length=3, max_length=320)
    code: str = Field(..., min_length=4, max_length=12)


class EmailOtpRequestResponse(BaseModel):
    ok: bool = True
    email: str
    purpose: str
    expires_in_sec: int
    channels: list[str] = Field(default_factory=list)
    message: str = ""
    debug_code: str | None = None
