"""Safe read-only contracts for the administrator system dashboard."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

AdminSystemStatus = Literal["normal", "attention", "error", "no_data"]
AdminSystemFactKind = Literal["text", "number", "datetime"]
AdminSystemCheckKey = Literal[
    "api",
    "database",
    "redis",
    "worker",
    "notifications",
    "queue",
    "backup",
    "deployment",
    "https",
]
AdminSystemSnapshotSource = Literal["manual", "scheduled"]


class AdminSystemFact(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(max_length=160)
    kind: AdminSystemFactKind = "text"


class AdminSystemCheck(BaseModel):
    key: AdminSystemCheckKey
    title: str
    status: AdminSystemStatus
    summary: str
    next_step: str
    observed_at: datetime | None = None
    facts: list[AdminSystemFact] = Field(default_factory=list)


class AdminSystemStatusResponse(BaseModel):
    checked_at: datetime
    overall_status: AdminSystemStatus
    items: list[AdminSystemCheck]


class AdminSystemHistoryItem(BaseModel):
    key: AdminSystemCheckKey
    status: AdminSystemStatus


class AdminSystemHistorySnapshot(BaseModel):
    id: UUID
    captured_at: datetime
    overall_status: AdminSystemStatus
    source: AdminSystemSnapshotSource
    items: list[AdminSystemHistoryItem]


class AdminSystemHistoryResponse(BaseModel):
    snapshots: list[AdminSystemHistorySnapshot]
    retention_days: int = Field(ge=1, le=365)
