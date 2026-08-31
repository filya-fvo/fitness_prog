"""Auth request/response schemas."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class TelegramAuthRequest(BaseModel):
    """Body for POST /auth/telegram."""

    init_data: str = Field(..., min_length=1, description="Raw Telegram WebApp initData string")


class TelegramBrowserAuthRequest(BaseModel):
    """Signed OIDC result returned by Telegram's browser login library."""

    id_token: str = Field(..., min_length=32, max_length=8192)
    nonce: str = Field(..., min_length=32, max_length=512)


class TelegramBrowserLoginConfig(BaseModel):
    """Public configuration required to open the Telegram Login popup."""

    enabled: bool
    client_id: int | None = None
    nonce: str | None = None


class AuthUserResponse(BaseModel):
    """Public user fields returned after auth."""

    id: uuid.UUID
    telegram_id: int | None = None
    username: str | None = None
    auth_email: str | None = None
    subscription_status: str
    onboarding_completed: bool = False
    merged_from_user_ids: list[uuid.UUID] = Field(default_factory=list)
    last_merge_preference: Literal["email", "telegram"] | None = None

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
    merge_preference: Literal["email", "telegram"] | None = None


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
    user: AuthUserResponse | None = None
    merge_required: bool = False
    merge_preview: dict[str, Any] | None = None
