"""Safe contracts for the administrator audit journal."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AdminAuditActor(BaseModel):
    id: uuid.UUID
    label: str


class AdminAuditEntry(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None = None
    actor_label: str
    action: str
    object_type: str
    object_id: uuid.UUID | None = None
    object_label: str | None = None
    result: Literal["success", "failure"]
    description: str
    before: dict[str, object] = Field(default_factory=dict)
    after: dict[str, object] = Field(default_factory=dict)
    notification_status: str | None = None
    correlation_id: uuid.UUID
    created_at: datetime


class AdminAuditListResponse(BaseModel):
    items: list[AdminAuditEntry]
    total: int
    limit: int
    offset: int
    actors: list[AdminAuditActor]
    actions: list[str]


class AdminAuditExportRequest(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None
    actor_user_id: uuid.UUID | None = None
    query: str | None = Field(default=None, min_length=2, max_length=120)
    action: str | None = Field(
        default=None,
        min_length=3,
        max_length=80,
        pattern=r"^[a-z][a-z0-9_.]+$",
    )
    result: Literal["success", "failure"] | None = None
