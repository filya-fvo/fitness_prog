"""Safe read-only contracts for the administrator system dashboard."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AdminSystemStatus = Literal["normal", "attention", "error", "no_data"]
AdminSystemFactKind = Literal["text", "number", "datetime"]


class AdminSystemFact(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(max_length=160)
    kind: AdminSystemFactKind = "text"


class AdminSystemCheck(BaseModel):
    key: Literal[
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
