"""API contracts for friendships and private regularity competitions."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel


class FriendSummary(BaseModel):
    id: uuid.UUID
    label: str
    status: Literal["accepted", "blocked"]


class FriendListResponse(BaseModel):
    items: list[FriendSummary]


class CompetitionScoreResponse(BaseModel):
    score: float | None = None
    completed: int
    planned: int


class CompetitionSummary(BaseModel):
    id: uuid.UUID
    friendship_id: uuid.UUID
    friend_label: str
    status: Literal["pending", "active", "finished", "cancelled"]
    duration_days: Literal[14, 28]
    start_date: date | None = None
    end_date: date | None = None
    algorithm_version: str
    created_by_me: bool
    can_accept: bool
    my_score: CompetitionScoreResponse | None = None
    friend_score: CompetitionScoreResponse | None = None


class CompetitionListResponse(BaseModel):
    items: list[CompetitionSummary]


class CompetitionCreateRequest(BaseModel):
    friendship_id: uuid.UUID
    duration_days: Literal[14, 28] = 14


class SocialActionResponse(BaseModel):
    ok: bool = True
