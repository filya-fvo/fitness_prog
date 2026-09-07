"""User profile schemas (GET/PUT /users/me)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, Field, field_validator


_ANTHROPOMETRY_RANGES: dict[str, tuple[float, float]] = {
    "weight_kg": (20, 500),
    "height_cm": (80, 250),
    "age": (10, 120),
    "birth_year": (1900, 2100),
}
_MEASUREMENT_RANGE = (1, 500)
_GOAL_NUMERIC_RANGES: dict[str, tuple[float, float]] = {
    "days_per_week": (1, 7),
    "calorie_adjustment_pct": (-40, 40),
    "target_weight_kg": (20, 500),
    "manual_calorie_target": (800, 10_000),
}
_GOAL_ENUMS: dict[str, set[str]] = {
    "primary_goal": {"lose_fat", "gain_muscle", "maintain"},
    "level": {"beginner", "intermediate", "advanced"},
    "location": {"gym", "home", "outdoor"},
    "activity_level": {"sedentary", "light", "moderate", "active", "very_active"},
}
_GOAL_BOOLEAN_KEYS = {"cycle_training_enabled"}
_ACTIVATION_CHECKLIST_SIGNALS = {
    "plan_viewed",
    "schedule_saved",
    "set_logged",
    "checkin_saved",
    "measurement_saved",
    "measurement_skipped",
    "nutrition_opened",
    "faq_opened",
}
_ACTIVATION_CHECKLIST_KEYS = {
    "version",
    "started_at",
    "signals",
    "snoozed_until",
    "completed_at",
    "dismissed_at",
}


def _validate_workout_schedule(value: object) -> None:
    if not isinstance(value, dict) or set(value) != {"version", "days", "start_time"}:
        raise ValueError("workout_schedule must be a supported object")
    if value.get("version") != 1:
        raise ValueError("unsupported workout_schedule version")
    days = value.get("days")
    if (
        not isinstance(days, list)
        or not 1 <= len(days) <= 7
        or any(not isinstance(day, int) or isinstance(day, bool) or not 0 <= day <= 6 for day in days)
        or len(set(days)) != len(days)
    ):
        raise ValueError("workout_schedule days are invalid")
    start_time = value.get("start_time")
    if not isinstance(start_time, str):
        raise ValueError("workout_schedule start_time is invalid")
    try:
        time.fromisoformat(start_time)
    except ValueError as exc:
        raise ValueError("workout_schedule start_time is invalid") from exc


def _validate_activation_checklist(value: object) -> None:
    if not isinstance(value, dict) or set(value) - _ACTIVATION_CHECKLIST_KEYS:
        raise ValueError("activation_checklist must be a supported object")
    if value.get("version") != 1:
        raise ValueError("unsupported activation_checklist version")
    started_at = value.get("started_at")
    if not isinstance(started_at, str) or len(started_at) > 64:
        raise ValueError("activation_checklist started_at must be ISO datetime")
    try:
        datetime.fromisoformat(started_at)
    except ValueError as exc:
        raise ValueError("activation_checklist started_at must be ISO datetime") from exc
    signals = value.get("signals")
    if (
        not isinstance(signals, list)
        or len(signals) > len(_ACTIVATION_CHECKLIST_SIGNALS)
        or any(
            not isinstance(signal, str) or signal not in _ACTIVATION_CHECKLIST_SIGNALS
            for signal in signals
        )
        or len(set(signals)) != len(signals)
    ):
        raise ValueError("activation_checklist signals are invalid")
    for key in ("completed_at", "dismissed_at"):
        raw = value.get(key)
        if raw is None:
            continue
        if not isinstance(raw, str) or len(raw) > 64:
            raise ValueError(f"activation_checklist {key} must be ISO datetime")
        try:
            datetime.fromisoformat(raw)
        except ValueError as exc:
            raise ValueError(f"activation_checklist {key} must be ISO datetime") from exc
    snoozed = value.get("snoozed_until")
    if snoozed is not None:
        if not isinstance(snoozed, str) or len(snoozed) != 10:
            raise ValueError("activation_checklist snoozed_until must be ISO date")
        try:
            date.fromisoformat(snoozed)
        except ValueError as exc:
            raise ValueError("activation_checklist snoozed_until must be ISO date") from exc


class UserProfileResponse(BaseModel):
    id: uuid.UUID
    telegram_id: int | None = None
    username: str | None = None
    auth_email: str | None = None
    anthropometry: dict[str, Any] = Field(default_factory=dict)
    goals: dict[str, Any] = Field(default_factory=dict)
    subscription_status: str
    stars_balance: int = 0
    onboarding_completed: bool = False

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    """Partial profile update from onboarding / settings."""

    anthropometry: dict[str, Any] | None = None
    goals: dict[str, Any] | None = None

    @field_validator("anthropometry")
    @classmethod
    def validate_anthropometry(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        for key, (minimum, maximum) in _ANTHROPOMETRY_RANGES.items():
            raw = value.get(key)
            if raw is None:
                continue
            if isinstance(raw, bool):
                raise ValueError(f"{key} must be numeric")
            try:
                number = float(raw)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{key} must be numeric") from exc
            if not minimum <= number <= maximum:
                raise ValueError(f"{key} must be between {minimum:g} and {maximum:g}")

        measurements = value.get("measurements")
        if measurements is not None:
            if not isinstance(measurements, dict):
                raise ValueError("measurements must be an object")
            for key, raw in measurements.items():
                if isinstance(raw, bool):
                    raise ValueError(f"measurement {key} must be numeric")
                try:
                    number = float(raw)
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"measurement {key} must be numeric") from exc
                if not _MEASUREMENT_RANGE[0] <= number <= _MEASUREMENT_RANGE[1]:
                    raise ValueError(f"measurement {key} is outside the allowed range")
        return value

    @field_validator("goals")
    @classmethod
    def validate_goals(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        for key, allowed in _GOAL_ENUMS.items():
            raw = value.get(key)
            if raw is not None and str(raw) not in allowed:
                raise ValueError(f"unsupported {key}")
        for key in _GOAL_BOOLEAN_KEYS:
            if key in value and not isinstance(value[key], bool):
                raise ValueError(f"{key} must be boolean")
        for key, (minimum, maximum) in _GOAL_NUMERIC_RANGES.items():
            raw = value.get(key)
            if raw is None:
                continue
            if isinstance(raw, bool):
                raise ValueError(f"{key} must be numeric")
            try:
                number = float(raw)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{key} must be numeric") from exc
            if not minimum <= number <= maximum:
                raise ValueError(f"{key} must be between {minimum:g} and {maximum:g}")
        if "activation_checklist" in value:
            _validate_activation_checklist(value["activation_checklist"])
        if "workout_schedule" in value:
            _validate_workout_schedule(value["workout_schedule"])
        return value
