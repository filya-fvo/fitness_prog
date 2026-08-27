"""Contracts for the administrator user detail card."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AdminUserQuestionnaire(BaseModel):
    sex: str | None = None
    age: int | None = None
    birth_date: date | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    target_weight_kg: float | None = None
    primary_goal: str | None = None
    level: str | None = None
    activity_level: str | None = None
    days_per_week: int | None = None
    location: str | None = None
    equipment: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    limitations_note: str | None = None


class AdminUserProgramSummary(BaseModel):
    id: uuid.UUID
    name: str
    next_day: int | None = None
    week_phase: str | None = None


class AdminUserSummary(BaseModel):
    id: uuid.UUID
    display_name: str
    telegram_id: int | None = None
    username: str | None = None
    auth_email: str | None = None
    login_methods: list[Literal["telegram", "email"]] = Field(default_factory=list)
    merge_state: Literal["separate", "linked", "merged_primary", "merged_source"]
    merged_sources_count: int = 0
    last_merge_preference: Literal["email", "telegram"] | None = None
    registered_at: datetime | None = None
    last_activity_at: datetime | None = None
    onboarding_completed: bool = False
    questionnaire: AdminUserQuestionnaire
    active_program: AdminUserProgramSummary | None = None
    subscription_status: str = "free"
    stars_balance: int = 0


class AdminUserWorkoutSummary(BaseModel):
    id: uuid.UUID
    scheduled_date: date
    title: str
    status: str
    workout_type: str | None = None
    rpe: int | None = None
    duration_sec: int | None = None
    sets_count: int = 0
    completed_sets: int = 0
    completed_at: datetime | None = None


class AdminUserNextWorkout(BaseModel):
    target_date: date
    start_time: time
    title: str
    program_id: uuid.UUID | None = None
    day_index: int | None = None
    status: str


class AdminUserRecordCounts(BaseModel):
    workouts: int = 0
    completed_workouts: int = 0
    nutrition_logs: int = 0
    body_measurements: int = 0
    daily_weight_entries: int = 0


class AdminUserActivity(BaseModel):
    next_workout: AdminUserNextWorkout | None = None
    recent_workouts: list[AdminUserWorkoutSummary] = Field(default_factory=list)
    counts: AdminUserRecordCounts


class AdminNotificationCategory(BaseModel):
    key: str
    title: str
    enabled: bool
    details: str


class AdminWebPushSummary(BaseModel):
    total: int = 0
    active: int = 0
    last_success_at: datetime | None = None
    failures: int = 0


class AdminUserSafeEvent(BaseModel):
    id: uuid.UUID
    actor_label: str
    action: str
    result: Literal["success", "failure"]
    description: str
    notification_status: str | None = None
    created_at: datetime


class AdminUserCommunications(BaseModel):
    telegram_available: bool
    reminders_enabled: bool
    timezone: str
    categories: list[AdminNotificationCategory] = Field(default_factory=list)
    web_push: AdminWebPushSummary
    recent_events: list[AdminUserSafeEvent] = Field(default_factory=list)


class AdminServiceMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = " ".join(value.split()).strip()
        if not normalized:
            raise ValueError("Сообщение не может быть пустым")
        return normalized


class AdminResendGuideRequest(BaseModel):
    kind: Literal["start", "guide"]


class AdminNotificationToggleRequest(BaseModel):
    enabled: bool
    confirmed_user_request: bool = False
