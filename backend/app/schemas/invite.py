"""Public contracts for referral invitation creation and acceptance."""

from __future__ import annotations

import uuid
from datetime import datetime

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


class InviteAcceptResponse(BaseModel):
    accepted: bool = True
    already_accepted: bool = False
    inviter_label: str


class InviteRevokeResponse(BaseModel):
    revoked: bool = True
