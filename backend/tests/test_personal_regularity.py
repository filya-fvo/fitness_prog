from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.routers.notifications import NotificationSettingsUpdate, put_settings_route
from app.models.user import User
from app.schemas.scheduler import PersonalRegularityResponse
from app.services.personal_regularity import calculate_personal_regularity
from app.services.scheduler import record_workout_schedule_change


def _goals(*, days: list[int] | None = None) -> dict:
    return {
        "active_program_id": "11111111-1111-4111-8111-111111111111",
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "workouts": {"days": days or [0, 2, 4], "time": "18:30"},
        }
    }


def test_monday_wednesday_friday_plan_is_not_a_one_day_streak() -> None:
    goals = _goals()
    completed = {
        date(2026, 8, 10),
        date(2026, 8, 12),
        date(2026, 8, 14),
        date(2026, 8, 17),
        date(2026, 8, 19),
        date(2026, 8, 21),
        date(2026, 8, 24),
        date(2026, 8, 26),
        date(2026, 8, 28),
        date(2026, 8, 31),
        date(2026, 9, 2),
        date(2026, 9, 4),
    }

    result = calculate_personal_regularity(
        goals=goals,
        local_day=date(2026, 9, 6),
        completed_dates=completed,
    )

    assert result.planned == 12
    assert result.completed == 12
    assert result.completion_pct == 100
    assert PersonalRegularityResponse.model_validate(result, from_attributes=True).planned == 12


def test_completed_move_counts_for_original_slot_and_cancellation_does_not() -> None:
    goals = _goals()
    goals["workout_schedule_overrides"] = [{
        "original_date": "2026-09-04",
        "target_date": "2026-09-05",
        "target_time": "10:00",
    }]
    goals["workout_schedule_cancellations"] = [{
        "scheduled_date": "2026-09-02",
        "source_date": None,
    }]

    result = calculate_personal_regularity(
        goals=goals,
        local_day=date(2026, 9, 6),
        completed_dates={date(2026, 8, 31), date(2026, 9, 5)},
        days=7,
    )

    assert result.planned == 3
    assert result.completed == 2
    assert result.rescheduled_completed == 1
    assert result.cancelled == 1
    assert result.missed == 0
    assert result.completion_pct == 66.7


def test_today_is_not_counted_until_completed_or_cancelled() -> None:
    goals = _goals(days=[0])
    today = date(2026, 9, 7)

    pending = calculate_personal_regularity(
        goals=goals,
        local_day=today,
        completed_dates=set(),
        days=7,
        tracking_start=today,
    )
    completed = calculate_personal_regularity(
        goals=goals,
        local_day=today,
        completed_dates={today},
        days=7,
        tracking_start=today,
    )
    goals["workout_schedule_cancellations"] = [{"scheduled_date": today.isoformat()}]
    cancelled = calculate_personal_regularity(
        goals=goals,
        local_day=today,
        completed_dates=set(),
        days=7,
        tracking_start=today,
    )

    assert pending.planned == 0
    assert completed.planned == completed.completed == 1
    assert cancelled.planned == cancelled.cancelled == 1
    assert cancelled.completion_pct == 0


def test_move_to_today_stays_pending_until_target_is_completed() -> None:
    goals = _goals(days=[4])
    goals["workout_schedule_overrides"] = [{
        "original_date": "2026-09-04",
        "target_date": "2026-09-05",
        "target_time": "10:00",
    }]

    pending = calculate_personal_regularity(
        goals=goals,
        local_day=date(2026, 9, 5),
        completed_dates=set(),
        days=7,
    )
    completed = calculate_personal_regularity(
        goals=goals,
        local_day=date(2026, 9, 5),
        completed_dates={date(2026, 9, 5)},
        days=7,
    )

    assert pending.planned == 0
    assert completed.planned == completed.completed == 1
    assert completed.rescheduled_completed == 1


def test_schedule_change_does_not_rewrite_previous_weeks() -> None:
    goals = _goals(days=[1, 3, 5])
    goals = record_workout_schedule_change(
        goals,
        previous_days={0, 2, 4},
        new_days={1, 3, 5},
        effective_from=date(2026, 9, 1),
        tracking_start=date(2026, 8, 10),
    )

    summary = calculate_personal_regularity(
        goals=goals,
        local_day=date(2026, 9, 6),
        completed_dates={
            date(2026, 8, 10),
            date(2026, 8, 12),
            date(2026, 8, 14),
            date(2026, 9, 1),
            date(2026, 9, 3),
            date(2026, 9, 5),
        },
        tracking_start=date(2026, 8, 10),
    )

    assert summary.planned == 13
    assert summary.completed == 6
    assert goals["workout_schedule_history"] == [
        {"effective_from": "2026-08-10", "days": [0, 2, 4]},
        {"effective_from": "2026-09-01", "days": [1, 3, 5]},
    ]


def test_second_schedule_change_on_same_day_replaces_analytics_version() -> None:
    goals = _goals(days=[1, 3, 5])
    changed = record_workout_schedule_change(
        goals,
        previous_days={0, 2, 4},
        new_days={1, 3, 5},
        effective_from=date(2026, 9, 1),
        tracking_start=date(2026, 8, 10),
    )
    changed = record_workout_schedule_change(
        changed,
        previous_days={1, 3, 5},
        new_days={0, 3, 6},
        effective_from=date(2026, 9, 1),
        tracking_start=date(2026, 8, 10),
    )

    assert changed["workout_schedule_history"][-1] == {
        "effective_from": "2026-09-01",
        "days": [0, 3, 6],
    }


@pytest.mark.asyncio
async def test_notification_settings_save_records_schedule_version(monkeypatch) -> None:
    user = User(
        id=uuid4(),
        goals={
            **_goals(days=[0, 2, 4]),
            "active_program_started_at": "2026-08-10",
        },
    )
    session = AsyncMock()
    monkeypatch.setattr(
        "app.routers.notifications.scheduler_service.local_schedule_day",
        lambda _goals, _now=None: date(2026, 9, 6),
    )

    await put_settings_route(
        NotificationSettingsUpdate(
            settings={
                "timezone": "Europe/Moscow",
                "workouts": {"days": [1, 3, 5], "time": "18:30"},
            }
        ),
        session=session,
        user=user,
    )

    assert user.goals["workout_schedule_history"] == [
        {"effective_from": "2026-08-10", "days": [0, 2, 4]},
        {"effective_from": "2026-09-06", "days": [1, 3, 5]},
    ]
    session.commit.assert_awaited_once()
    session.refresh.assert_awaited_once_with(user)
