"""Public contracts for referral invitation creation and acceptance."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class InviteCredential(BaseModel):
    value: str = Field(min_length=6, max_length=128)


class InviteCreatedResponse(BaseModel):
    id: uuid.UUID
    token: str
    code: str
    web_url: str
    telegram_url: str | None = None
    expires_at: datetime


class InvitePreviewResponse(BaseModel):
    inviter_label: str
    expires_at: datetime
    already_accepted: bool = False
    mode: Literal["referral", "social"] = "referral"
    competition_duration_days: Literal[14] | None = None


class InviteAcceptResponse(BaseModel):
    accepted: bool = True
    already_accepted: bool = False
    inviter_label: str
    mode: Literal["referral", "social"] = "referral"
    friendship_id: uuid.UUID | None = None
    competition_id: uuid.UUID | None = None


class InviteRevokeResponse(BaseModel):
    revoked: bool = True
