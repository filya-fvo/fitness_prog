"""User and administrator contracts for in-app support."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SupportCategory = Literal["bug", "question", "idea", "other"]
SupportStatus = Literal["waiting_support", "waiting_user", "resolved", "closed"]


class SupportTicketCreate(BaseModel):
    category: SupportCategory
    message: str = Field(min_length=3, max_length=3500)
    page: str = Field(default="", max_length=300)
    client: Literal["telegram", "browser"] = "browser"
    app_version: str = Field(default="", max_length=80)
    idempotency_key: uuid.UUID


class SupportMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=3500)
    idempotency_key: uuid.UUID


class SupportMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    author_type: Literal["user", "admin", "system"]
    body: str
    delivery_channel: Literal["in_app", "telegram"]
    delivery_status: Literal["pending", "sent", "failed", "not_requested", "unavailable"]
    created_at: datetime


class SupportTicketSummary(BaseModel):
    id: uuid.UUID
    category: SupportCategory
    status: SupportStatus
    subject: str
    last_message_preview: str
    unread: bool
    last_message_at: datetime
    created_at: datetime


class SupportTicketListResponse(BaseModel):
    items: list[SupportTicketSummary]
    total: int


class SupportTicketDetail(SupportTicketSummary):
    source_page: str | None = None
    client: str
    app_version: str | None = None
    messages: list[SupportMessageResponse]


class AdminSupportTicketSummary(SupportTicketSummary):
    user_id: uuid.UUID
    user_label: str


class AdminSupportTicketListResponse(BaseModel):
    items: list[AdminSupportTicketSummary]
    total: int
    page: int
    page_size: int
    waiting_support: int


class AdminSupportTicketDetail(SupportTicketDetail):
    user_id: uuid.UUID
    user_label: str


class SupportStatusUpdate(BaseModel):
    status: Literal["waiting_support", "waiting_user", "resolved", "closed"]
