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
    """Body for POST /auth/email/request-code."""

    email: str = Field(..., min_length=3, max_length=254)


class EmailOtpVerifyRequest(BaseModel):
    """Body for POST /auth/email/verify."""

    email: str = Field(..., min_length=3, max_length=254)
    code: str = Field(..., min_length=4, max_length=8)


class EmailOtpRequestResponse(BaseModel):
    ok: bool = True
    email: str
    expires_in_sec: int
    resend_after_sec: int
    delivery: str
    message: str
    # Present only in non-production when SMTP is not configured.
    dev_code: str | None = None
    dev_send_error: str | None = None


class EmailAuthResponse(BaseModel):
    """JWT session after email OTP verify."""

    access_token: str
    token_type: str = "bearer"
    expires_in_days: int
    user: AuthUserResponse


class EmailLinkResponse(BaseModel):
    """Result of attaching email to the current account."""

    ok: bool = True
    message: str = "Почта привязана"
    user: AuthUserResponse
