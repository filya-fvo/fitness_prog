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
    source: str  # rule | llm | cache
    remaining_requests: int | None = None


class AIAnalyzeRequest(BaseModel):
    days: int = Field(default=14, ge=1, le=60)


class AIAnalyzeResponse(BaseModel):
    report: str
    source: str
    remaining_requests: int | None = None


class AIMessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    timestamp: datetime

    model_config = {"from_attributes": True}
