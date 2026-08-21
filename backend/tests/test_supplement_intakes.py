"""Unit tests for supplement schedule materialization."""

import uuid
from datetime import UTC, date, datetime

from app.models.user import User
from app.services.supplement_intakes import _scheduled_rows, local_day_for_user


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
