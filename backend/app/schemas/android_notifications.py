"""Bounded private Android reminder projection contracts."""

from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_EVENTS = 2048
MAX_PLAN_BYTES = 1024 * 1024


class ReminderModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="after", check_fields=False)
    @classmethod
    def utc_timestamps(cls, value):
        if isinstance(value, datetime):
            if value.tzinfo is None:
                raise ValueError("Timezone required")
            return value.astimezone(UTC)
        return value


class AndroidReminderContext(ReminderModel):
    occurrence_date: date | None = None
    occurrence_key: str | None = Field(default=None, max_length=200)
    slot: str | None = Field(default=None, max_length=40)
    supplement_entry_ids: list[str] = Field(default_factory=list, max_length=500)
    starts_at: datetime | None = None
    zero_lead: bool | None = None

    @field_validator("supplement_entry_ids")
    @classmethod
    def bounded_ids(cls, value: list[str]) -> list[str]:
        if any(not entry or len(entry) > 200 for entry in value):
            raise ValueError("Invalid supplement entry")
        return value


class AndroidReminder(ReminderModel):
    key: str = Field(min_length=1, max_length=200)
    category: Literal["workouts", "supplements", "water", "calories", "measurements"]
    due_at: datetime
    expires_at: datetime
    local_date: date
    route: Literal["home", "workouts", "supplements", "nutrition", "measurements"]
    context: AndroidReminderContext = Field(default_factory=AndroidReminderContext)

    @model_validator(mode="after")
    def valid_interval(self):
        if self.expires_at <= self.due_at:
            raise ValueError("Empty reminder interval")
        return self


class AndroidQuietHours(ReminderModel):
    enabled: bool
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class AndroidNotificationPlan(ReminderModel):
    owner: UUID
    schema_version: Literal[1] = 1
    settings_revision: str = Field(pattern=r"^[0-9a-f]{64}$")
    generated_at: datetime
    valid_until: datetime
    timezone: str = Field(max_length=100)
    catch_up: bool
    quiet_hours: AndroidQuietHours
    events: list[AndroidReminder] = Field(max_length=MAX_EVENTS)

    @model_validator(mode="after")
    def bounded_plan(self):
        zone = ZoneInfo(self.timezone)
        if self.valid_until <= self.generated_at:
            raise ValueError("Expired plan")
        keys = set()
        for event in self.events:
            if event.key in keys or event.due_at >= self.valid_until:
                raise ValueError("Duplicate or out of range reminder")
            if event.expires_at > self.valid_until:
                raise ValueError("Reminder exceeds horizon")
            if event.local_date != event.due_at.astimezone(zone).date():
                raise ValueError("Invalid reminder date")
            keys.add(event.key)
        if self.events != sorted(self.events, key=lambda event: (event.due_at, event.key)):
            raise ValueError("Unsorted plan")
        if len(self.model_dump_json().encode("utf-8")) > MAX_PLAN_BYTES:
            raise ValueError("Reminder plan too large")
        return self


class AndroidDeliveryState(ReminderModel):
    enabled: bool = False
    device_id: UUID | None = None
    revision: int = Field(default=0, ge=0)
    confirmed_at: datetime | None = None


class AndroidDeliveryUpdate(ReminderModel):
    operation_id: UUID
    device_id: UUID
    enabled: bool
    expected_revision: int = Field(ge=0, strict=True)
    expected_settings_revision: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def enable_requires_plan(self):
        if self.enabled and self.expected_settings_revision is None:
            raise ValueError("Plan fingerprint required")
        return self


class AndroidDeliveryResponse(ReminderModel):
    android_delivery: AndroidDeliveryState
