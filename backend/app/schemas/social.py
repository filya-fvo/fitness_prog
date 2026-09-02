"""API contracts for friendships and private/global regularity competitions."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

CompetitionMetric = Literal[
    "regularity",
    "weight_loss",
    "waist_reduction",
    "relative_strength",
]


class CompetitionFactor(BaseModel):
    metric: CompetitionMetric
    exercise_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_exercise(self) -> "CompetitionFactor":
        if self.metric == "relative_strength" and self.exercise_id is None:
            raise ValueError("Для силового прогресса выберите упражнение")
        if self.metric != "relative_strength" and self.exercise_id is not None:
            raise ValueError("Упражнение можно выбрать только для силового прогресса")
        return self

    @property
    def key(self) -> str:
        if self.exercise_id is None:
            return self.metric
        return f"{self.metric}:{self.exercise_id}"


class CompetitionFactorSummary(BaseModel):
    key: str
    metric: CompetitionMetric
    label: str
    exercise_id: uuid.UUID | None = None


class CompetitionFactorResult(BaseModel):
    key: str
    metric: CompetitionMetric
    label: str
    status: Literal["ready", "baseline_missing", "no_progress"]
    value: float | None = None
    completed: int | None = None
    planned: int | None = None
    baseline_value: float | None = None
    latest_value: float | None = None
    baseline_date: date | None = None
    latest_date: date | None = None
    unit: str | None = None
    capped: bool = False


class CompetitionParticipantAnalytics(BaseModel):
    wins: int = 0
    factors: list[CompetitionFactorResult]


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
    title: str | None = None
    duration_days: int = Field(ge=7, le=365)
    start_date: date | None = None
    end_date: date | None = None
    algorithm_version: str
    created_by_me: bool
    can_accept: bool
    factors: list[CompetitionFactorSummary] = Field(default_factory=list)
    winner: Literal["me", "friend", "tie"] | None = None
    my_analytics: CompetitionParticipantAnalytics | None = None
    friend_analytics: CompetitionParticipantAnalytics | None = None
    my_score: CompetitionScoreResponse | None = None
    friend_score: CompetitionScoreResponse | None = None


class CompetitionListResponse(BaseModel):
    items: list[CompetitionSummary]


class CompetitionCreateRequest(BaseModel):
    friendship_id: uuid.UUID
    title: str | None = Field(default=None, max_length=120)
    duration_days: int = Field(default=14, ge=7, le=365)
    factors: list[CompetitionFactor] = Field(
        default_factory=lambda: [CompetitionFactor(metric="regularity")],
        min_length=1,
        max_length=4,
    )

    @model_validator(mode="after")
    def unique_factors(self) -> "CompetitionCreateRequest":
        keys = [factor.key for factor in self.factors]
        if len(keys) != len(set(keys)):
            raise ValueError("Факторы соревнования не должны повторяться")
        if self.title is not None:
            self.title = self.title.strip() or None
        return self


class SocialActionResponse(BaseModel):
    ok: bool = True


class GlobalLeaderboardEntry(BaseModel):
    rank: int
    alias: str
    score: float
    completed: int
    planned: int
    is_me: bool = False


class GlobalSeasonResponse(BaseModel):
    season_key: str
    title: str
    start_date: date
    end_date: date
    join_deadline: date
    status: Literal["not_joined", "joined", "left"]
    algorithm_version: str
    cohort: Literal["days_1_2", "days_3", "days_4_plus"]
    cohort_label: str
    participant_count: int
    minimum_cohort_size: int
    ranking_unlocked: bool
    ranked_eligible: bool
    provisional: bool
    my_alias: str | None = None
    my_rank: int | None = None
    my_score: CompetitionScoreResponse | None = None
    leaderboard: list[GlobalLeaderboardEntry]
