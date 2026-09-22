from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.models.user import User
from app.services import illness_pause
from app.services.notification_prefs import due_notifications
from app.services.personal_regularity import calculate_personal_regularity
from app.services.scheduler import get_schedule_overview, schedule_overview
from app.services.workout_notifications import due_workout_notification


def _goals() -> dict:
    return {
        "active_program_id": "11111111-1111-4111-8111-111111111111",
        "active_program_next_day": 1,
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "workouts": {
                "enabled": True,
                "days": [0, 2, 4],
                "time": "18:30",
                "remind_before_minutes": 60,
            },
        },
    }


def test_active_illness_pauses_schedule_and_reminders() -> None:
    goals = _goals()
    goals[illness_pause.PERIODS_KEY] = [{"started_on": "2026-09-21", "ended_on": None}]

    overview = schedule_overview(goals, date(2026, 9, 21))
    reminder = due_workout_notification(
        goals,
        now=datetime(2026, 9, 21, 17, 30, tzinfo=timezone(timedelta(hours=3))),
        catch_up=False,
        window_minutes=1,
    )

    assert overview["current"]["status"] == "paused"
    assert overview["current"]["can_reschedule"] is False
    assert overview["current"]["can_cancel"] is False
    assert overview["next"] is None
    assert reminder is None


def test_active_illness_suppresses_legacy_workout_and_relative_supplement_reminders() -> None:
    goals = _goals()
    goals[illness_pause.PERIODS_KEY] = [{"started_on": "2026-09-21", "ended_on": None}]
    goals["notification_settings"]["measurements"] = {"enabled": False}
    goals["supplements"] = [
        {
            "id": "pre",
            "name_ru": "Добавка",
            "schedule": [{"slot": "pre_workout", "days": "workout"}],
        }
    ]

    due = due_notifications(
        goals,
        now=datetime(2026, 9, 21, 17, 30, tzinfo=timezone(timedelta(hours=3))),
        catch_up=False,
        window_minutes=1,
    )

    assert not {item["kind"] for item in due} & {"workout", "supplement"}


@pytest.mark.asyncio
async def test_closed_illness_day_is_not_offered_as_missed() -> None:
    goals = _goals()
    goals[illness_pause.PERIODS_KEY] = [{
        "started_on": "2026-09-21",
        "ended_on": "2026-09-21",
    }]
    user = type("UserView", (), {
        "id": "user-1",
        "goals": goals,
        "created_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
    })()
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)

    overview = await get_schedule_overview(session, user, date(2026, 9, 22))

    assert overview["current"] is None
    assert overview["next"]["target_date"] == date(2026, 9, 23)


def test_illness_days_are_excluded_from_regularity_denominator() -> None:
    goals = _goals()
    goals[illness_pause.PERIODS_KEY] = [{
        "started_on": "2026-09-14",
        "ended_on": "2026-09-18",
    }]

    summary = calculate_personal_regularity(
        goals=goals,
        local_day=date(2026, 9, 21),
        completed_dates={date(2026, 9, 9), date(2026, 9, 11)},
        days=14,
    )

    assert summary.paused == 3
    assert summary.planned == 2
    assert summary.completed == 2
    assert summary.missed == 0
    assert summary.completion_pct == 100


@pytest.mark.asyncio
async def test_pause_end_offers_and_activates_light_recovery_cycle() -> None:
    user = User(id=uuid4(), goals=_goals(), anthropometry={})
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=user)

    started = await illness_pause.start_illness_pause(
        session,
        user,
        local_day=date(2026, 9, 18),
    )
    ended = await illness_pause.end_illness_pause(
        session,
        user,
        local_day=date(2026, 9, 22),
    )
    recovery = await illness_pause.choose_recovery(session, user, choice="light_week")

    assert started["active"] is True
    assert illness_pause.is_illness_day(user.goals, date(2026, 9, 21)) is True
    assert ended["active"] is False
    assert ended["recovery_choice_pending"] is True
    assert recovery["recovery_light_week_active"] is True
    assert user.goals["active_program_week_phase"] == "light"
    assert illness_pause.recovery_light_week_active(
        illness_pause.finish_recovery_cycle(user.goals)
    ) is False
    assert session.commit.await_count == 3
