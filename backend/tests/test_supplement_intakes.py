"""Unit tests for supplement schedule materialization."""

import uuid
from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.user import User
from app.services.supplement_intakes import _scheduled_rows, due_groups, local_day_for_user


def _user(goals: dict) -> User:
    return User(id=uuid.uuid4(), goals=goals, anthropometry={})


def test_same_time_supplements_are_materialized_as_independent_rows() -> None:
    user = _user(
        {
            "notification_settings": {"timezone": "Europe/Moscow"},
            "supplements": [
                {"id": "creatine", "key": "creatine", "name_ru": "Креатин", "dose": "5 г", "times": ["10:00"]},
                {"id": "protein", "key": "protein", "name_ru": "Протеин", "dose": "30 г", "times": ["10:00"]},
            ],
        }
    )
    rows = _scheduled_rows(user, date(2026, 8, 12))
    assert len(rows) == 2
    assert {row["supplement_entry_id"] for row in rows} == {"creatine", "protein"}
    assert rows[0]["scheduled_at"] == rows[1]["scheduled_at"]


def test_local_day_uses_profile_timezone_not_utc() -> None:
    user = _user({"notification_settings": {"timezone": "Asia/Vladivostok"}})
    assert local_day_for_user(user, datetime(2026, 8, 12, 18, 0, tzinfo=UTC)) == date(2026, 8, 13)


def test_workout_day_supplements_follow_one_off_move() -> None:
    user = _user(
        {
            "notification_settings": {
                "timezone": "Europe/Moscow",
                "workouts": {"time": "06:15", "days": [0, 2, 4]},
            },
            "workout_schedule_overrides": [
                {
                    "original_date": "2026-08-21",
                    "target_date": "2026-08-22",
                    "target_time": "08:00",
                }
            ],
            "supplements": [
                {
                    "id": "pre",
                    "name_ru": "Предтренировочный комплекс",
                    "schedule": [{"slot": "pre_workout", "days": "workout"}],
                }
            ],
        }
    )

    assert _scheduled_rows(user, date(2026, 8, 21)) == []
    moved_rows = _scheduled_rows(user, date(2026, 8, 22))
    assert len(moved_rows) == 1
    assert moved_rows[0]["scheduled_at"] == datetime(2026, 8, 22, 4, 15, tzinfo=UTC)


def test_illness_keeps_daily_and_rest_supplements_but_skips_workout_slots() -> None:
    user = _user(
        {
            "notification_settings": {
                "timezone": "Europe/Moscow",
                "workouts": {"time": "09:00", "days": [2]},
            },
            "workout_illness_periods": [{"started_on": "2026-09-23", "ended_on": None}],
            "supplements": [
                {"id": "workout", "schedule": [{"slot": "08:00", "days": "workout"}]},
                {"id": "relative", "schedule": [{"slot": "pre_workout", "days": "every"}]},
                {"id": "rest", "schedule": [{"slot": "08:00", "days": "rest"}]},
                {"id": "daily", "schedule": [{"slot": "21:00", "days": "every"}]},
            ],
        }
    )

    rows = _scheduled_rows(user, date(2026, 9, 23))

    assert {row["supplement_entry_id"] for row in rows} == {"rest", "daily"}


@pytest.mark.asyncio
async def test_illness_filters_previously_materialized_workout_intakes() -> None:
    user = _user(
        {
            "notification_settings": {"timezone": "Europe/Moscow"},
            "workout_illness_periods": [{"started_on": "2026-09-21", "ended_on": None}],
        }
    )
    stale = SimpleNamespace(
        slot="pre_workout",
        days_mode="workout",
        scheduled_at=datetime(2026, 9, 22, 6, 0, tzinfo=UTC),
        snoozed_until=None,
    )
    session = AsyncMock()
    session.scalars = AsyncMock(return_value=[stale])

    groups = await due_groups(
        session,
        user,
        now=datetime(2026, 9, 22, 6, 0, tzinfo=UTC),
    )

    assert groups == []
