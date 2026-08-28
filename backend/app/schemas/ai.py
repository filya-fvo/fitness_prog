"""AI chat/analyze schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: uuid.UUID | None = None


class AIChatResponse(BaseModel):
    session_id: uuid.UUID
    reply: str
    source: str  # local | rule
    remaining_requests: int | None = None


class AIAnalyzeRequest(BaseModel):
    days: int = Field(default=14, ge=1, le=365)
    session_id: uuid.UUID | None = None
    message: str | None = Field(default=None, min_length=1, max_length=4000)


class AIAnalyzeResponse(BaseModel):
    report: str
    source: str
    session_id: uuid.UUID | None = None
    remaining_requests: int | None = None


class AIMessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    timestamp: datetime

    model_config = {"from_attributes": True}


class AIHistoryResponse(BaseModel):
    session_id: uuid.UUID | None = None
    messages: list[AIMessageResponse] = Field(default_factory=list)
