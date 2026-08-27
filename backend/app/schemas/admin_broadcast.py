"""Contracts for the administrator broadcast center."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

AudienceKind = Literal[
    "all_telegram",
    "active",
    "onboarding_incomplete",
    "inactive_workouts",
    "program",
    "subscription",
]
BroadcastStatus = Literal["draft", "tested", "scheduled", "sending", "completed", "cancelled"]


class AdminBroadcastAudience(BaseModel):
    kind: AudienceKind = "all_telegram"
    days: int | None = Field(default=None, ge=1, le=365)
    program_id: uuid.UUID | None = None
    subscription_status: Literal["free", "pro_stars"] | None = None

    @model_validator(mode="after")
    def validate_parameters(self) -> AdminBroadcastAudience:
        if self.kind in {"active", "inactive_workouts"} and self.days is None:
            raise ValueError("Для выбранной аудитории нужно указать число дней")
        if self.kind == "program" and self.program_id is None:
            raise ValueError("Нужно выбрать программу")
        if self.kind == "subscription" and self.subscription_status is None:
            raise ValueError("Нужно выбрать статус подписки")
        return self


class AdminBroadcastDraftRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    message_text: str = Field(min_length=1, max_length=3000)
    audience: AdminBroadcastAudience
    idempotency_key: uuid.UUID

    @field_validator("title", "message_text")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Текст не должен быть пустым")
        return value


class AdminBroadcastUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    message_text: str = Field(min_length=1, max_length=3000)
    audience: AdminBroadcastAudience

    @field_validator("title", "message_text")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Текст не должен быть пустым")
        return value


class AdminBroadcastLaunchRequest(BaseModel):
    confirmed: bool
    confirmation_text: str = Field(min_length=1, max_length=80)
    expected_recipient_count: int = Field(ge=0)
    scheduled_at: datetime | None = None

    @field_validator("scheduled_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Время отправки должно содержать часовой пояс")
        return value


class AdminBroadcastRetryRequest(BaseModel):
    confirmed: bool
    confirmation_text: str = Field(min_length=1, max_length=80)


class AdminBroadcastCopyRequest(BaseModel):
    idempotency_key: uuid.UUID


class AdminBroadcastCounts(BaseModel):
    expected: int = 0
    pending: int = 0
    sending: int = 0
    sent: int = 0
    failed: int = 0
    skipped: int = 0


class AdminBroadcastResponse(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID
    title: str
    message_text: str
    audience: AdminBroadcastAudience
    status: BroadcastStatus
    counts: AdminBroadcastCounts
    tested_at: datetime | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    retry_count: int = 0
    created_at: datetime
    updated_at: datetime


class AdminBroadcastListResponse(BaseModel):
    items: list[AdminBroadcastResponse]
    total: int
    limit: int
    offset: int


class AdminBroadcastAudiencePreview(BaseModel):
    expected_count: int
