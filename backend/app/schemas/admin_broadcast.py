"""Contracts for the administrator broadcast center."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
    scheduled_timezone: str = Field(default="UTC", min_length=1, max_length=64)

    @field_validator("scheduled_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Время отправки должно содержать часовой пояс")
        return value

    @field_validator("scheduled_timezone")
    @classmethod
    def require_iana_timezone(cls, value: str) -> str:
        normalized = value.strip()
        try:
            ZoneInfo(normalized)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Укажите корректный часовой пояс") from exc
        return normalized


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
    cancelled: int = 0


class AdminBroadcastFailureReason(BaseModel):
    status: Literal["failed", "skipped"]
    code: Literal[
        "telegram_unavailable",
        "telegram_transport",
        "telegram_api",
        "worker_recovered",
        "unknown",
    ]
    count: int = Field(ge=1)


class AdminBroadcastResponse(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID
    title: str
    message_text: str
    audience: AdminBroadcastAudience
    status: BroadcastStatus
    counts: AdminBroadcastCounts
    failure_reasons: list[AdminBroadcastFailureReason] = Field(default_factory=list)
    tested_at: datetime | None = None
    scheduled_at: datetime | None = None
    scheduled_timezone: str = "UTC"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
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
