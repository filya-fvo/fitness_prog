"""Unit tests for schedule shift logic (TZ §6, §11)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.models.user import User
from app.services import supplement_intakes
from app.services.scheduler import (
    cancel_workout_occurrence,
    get_schedule_overview,
    next_base_workout_date,
    reschedule_workout_occurrence,
    schedule_overview,
)
from app.services.workout_notifications import due_workout_notification, mark_occurrence_started
from app.services.workout_shift import shift_future_workouts


class _FakeResult:
    def __init__(self, items: list) -> None:
        self._items = items

    def all(self) -> list:
        return self._items


@pytest.mark.asyncio
async def test_shift_future_workouts_moves_dates() -> None:
    d0 = date(2026, 7, 20)
    w1 = SimpleNamespace(id="1", scheduled_date=d0, status="planned")
    w2 = SimpleNamespace(id="2", scheduled_date=d0 + timedelta(days=2), status="planned")

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=_FakeResult([w1, w2]))
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    user = SimpleNamespace(id="user-1")
    moved = await shift_future_workouts(session, user, from_date=d0, days=1)

    assert len(moved) == 2
    assert w1.scheduled_date == d0 + timedelta(days=1)
    assert w2.scheduled_date == d0 + timedelta(days=3)
    session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_shift_future_workouts_zero_days_noop() -> None:
    session = AsyncMock()
    user = SimpleNamespace(id="user-1")
    moved = await shift_future_workouts(session, user, from_date=date.today(), days=0)
    assert moved == []
    session.scalars.assert_not_called()


def _schedule_goals(*, override: dict | None = None, lead: int = 60) -> dict:
    goals = {
        "active_program_next_day": 3,
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": True,
            "workouts": {
                "enabled": True,
                "time": "06:15",
                "days": [0, 2, 4],
                "remind_before_minutes": lead,
            },
        },
    }
    if override:
        goals["workout_schedule_overrides"] = [override]
    return goals


def test_one_off_friday_move_keeps_monday_schedule() -> None:
    friday = date(2026, 8, 21)
    saturday = date(2026, 8, 22)
    monday = date(2026, 8, 24)
    goals = _schedule_goals(
        override={
            "original_date": friday.isoformat(),
            "target_date": saturday.isoformat(),
            "target_time": "08:00",
            "day_index": 3,
            "title": "Ноги · день 3",
        }
    )

    friday_view = schedule_overview(goals, friday)
    assert friday_view["current"]["status"] == "moved"
    assert friday_view["next"]["target_date"] == saturday
    assert schedule_overview(goals, monday)["current"]["status"] == "scheduled"
    assert next_base_workout_date(goals, friday) == monday


def test_cancelled_friday_keeps_same_program_day_for_monday() -> None:
    friday = date(2026, 8, 28)
    monday = date(2026, 8, 31)
    goals = _schedule_goals()
    goals["workout_schedule_cancellations"] = [{
        "scheduled_date": friday.isoformat(),
        "source_date": None,
        "day_index": 3,
        "title": "Грудь + спина · день 3",
        "next_date": monday.isoformat(),
    }]

    friday_view = schedule_overview(goals, friday)
    monday_view = schedule_overview(goals, monday)

    assert friday_view["current"]["status"] == "cancelled"
    assert friday_view["current"]["can_cancel"] is False
    assert friday_view["next"]["target_date"] == monday
    assert friday_view["next"]["day_index"] == 3
    assert monday_view["current"]["status"] == "scheduled"
    assert monday_view["current"]["day_index"] == 3


def test_workout_reminder_uses_lead_and_program_day() -> None:
    tz = timezone(timedelta(hours=3))
    goals = _schedule_goals(lead=60)
    now = datetime(2026, 8, 21, 5, 15, tzinfo=tz)

    item = due_workout_notification(goals, now=now, catch_up=False, window_minutes=1)

    assert item is not None
    assert item["meta"]["start_time"] == "06:15"
    assert "Сегодня в 06:15" in item["text"]
    assert "День 3" in item["text"]


def test_moved_workout_reminder_follows_target_day_only() -> None:
    tz = timezone(timedelta(hours=3))
    friday = date(2026, 8, 21)
    goals = _schedule_goals(
        lead=60,
        override={
            "original_date": friday.isoformat(),
            "target_date": "2026-08-22",
            "target_time": "08:00",
            "day_index": 3,
            "title": "Тяговая тренировка",
        },
    )

    assert due_workout_notification(
        goals,
        now=datetime(2026, 8, 21, 5, 15, tzinfo=tz),
        catch_up=False,
        window_minutes=1,
    ) is None
    item = due_workout_notification(
        goals,
        now=datetime(2026, 8, 22, 7, 0, tzinfo=tz),
        catch_up=False,
        window_minutes=1,
    )
    assert item is not None
    assert item["meta"]["original_date"] == "2026-08-21"
    assert "Тяговая тренировка" in item["text"]


def test_cancelled_workout_has_no_reminder_and_next_regular_day_remains_due() -> None:
    tz = timezone(timedelta(hours=3))
    goals = _schedule_goals(lead=60)
    goals["workout_schedule_cancellations"] = [{
        "scheduled_date": "2026-08-28",
        "source_date": None,
        "day_index": 3,
        "title": "Грудь + спина",
        "next_date": "2026-08-31",
    }]

    assert due_workout_notification(
        goals,
        now=datetime(2026, 8, 28, 5, 15, tzinfo=tz),
        catch_up=False,
        window_minutes=1,
    ) is None
    monday = due_workout_notification(
        goals,
        now=datetime(2026, 8, 31, 5, 15, tzinfo=tz),
        catch_up=False,
        window_minutes=1,
    )
    assert monday is not None
    assert monday["meta"]["day_index"] == 3


def test_cancellation_from_another_program_does_not_hide_current_schedule() -> None:
    goals = _schedule_goals()
    goals["active_program_id"] = "33333333-3333-4333-8333-333333333333"
    goals["workout_schedule_cancellations"] = [{
        "scheduled_date": "2026-08-28",
        "program_id": "44444444-4444-4444-8444-444444444444",
    }]

    overview = schedule_overview(goals, date(2026, 8, 28))

    assert overview["current"]["status"] == "scheduled"
    assert overview["next"]["target_date"] == date(2026, 8, 28)


def test_starting_early_suppresses_later_notification() -> None:
    tz = timezone(timedelta(hours=3))
    goals = mark_occurrence_started(_schedule_goals(lead=60), date(2026, 8, 21))

    item = due_workout_notification(
        goals,
        now=datetime(2026, 8, 21, 5, 15, tzinfo=tz),
        catch_up=False,
        window_minutes=1,
    )

    assert item is None


@pytest.mark.asyncio
async def test_overview_offers_recent_unperformed_friday_on_saturday() -> None:
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id="user-1", goals=_schedule_goals())

    overview = await get_schedule_overview(session, user, date(2026, 8, 22))

    assert overview["current"]["status"] == "missed"
    assert overview["current"]["original_date"] == date(2026, 8, 21)
    assert overview["current"]["reschedule_until"] == date(2026, 8, 23)
    assert overview["next"]["target_date"] == date(2026, 8, 24)


@pytest.mark.asyncio
async def test_overview_does_not_offer_a_performed_workout_as_missed() -> None:
    session = AsyncMock()
    session.scalar = AsyncMock(return_value="workout-id")
    goals = _schedule_goals()
    goals["active_program_next_day"] = 4
    user = SimpleNamespace(id="user-1", goals=goals)

    overview = await get_schedule_overview(session, user, date(2026, 8, 22))

    assert overview["current"] is None
    assert overview["next"]["target_date"] == date(2026, 8, 24)
    assert overview["next"]["day_index"] == 4


@pytest.mark.asyncio
async def test_new_program_does_not_offer_occurrence_before_its_start_date() -> None:
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)
    goals = _schedule_goals()
    goals["active_program_started_at"] = "2026-08-27"  # Thursday
    user = SimpleNamespace(
        id="user-1",
        goals=goals,
        created_at=datetime(2026, 8, 27, 9, 0, tzinfo=timezone.utc),
    )

    overview = await get_schedule_overview(session, user, date(2026, 8, 27))

    assert overview["current"] is None
    assert overview["next"]["target_date"] == date(2026, 8, 28)
    assert overview["next"]["status"] == "scheduled"
    assert overview["next"]["day_index"] == 3


@pytest.mark.asyncio
async def test_overview_marks_todays_completed_occurrence_and_advances_next() -> None:
    completed = SimpleNamespace(
        program_id=None,
        title="Спина и грудь",
        plan={"day_index": 2, "title": "Спина и грудь"},
    )
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=completed)
    user = SimpleNamespace(id="user-1", goals=_schedule_goals())

    overview = await get_schedule_overview(session, user, date(2026, 8, 21))

    assert overview["current"]["status"] == "completed"
    assert overview["current"]["title"] == "Спина и грудь"
    assert overview["current"]["day_index"] == 2
    assert overview["current"]["can_reschedule"] is False
    assert overview["current"]["can_cancel"] is False
    assert overview["next"]["target_date"] == date(2026, 8, 24)


@pytest.mark.asyncio
async def test_reschedule_updates_only_one_occurrence(monkeypatch) -> None:
    goals = _schedule_goals()
    locked_user = User(id=uuid.uuid4(), goals=goals, anthropometry={})
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=locked_user)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    reset_days = AsyncMock()
    monkeypatch.setattr(supplement_intakes, "reset_pending_days", reset_days)

    overview = await reschedule_workout_occurrence(
        session,
        locked_user,
        original_date=date(2026, 8, 21),
        target_date=date(2026, 8, 22),
        target_time=time(8, 0),
        now=datetime(2026, 8, 21, 12, 0, tzinfo=timezone(timedelta(hours=3))),
    )

    override = locked_user.goals["workout_schedule_overrides"][0]
    assert override["original_date"] == "2026-08-21"
    assert override["target_date"] == "2026-08-22"
    assert overview["current"]["status"] == "moved"
    assert next_base_workout_date(locked_user.goals, date(2026, 8, 21)) == date(2026, 8, 24)
    reset_days.assert_awaited_once()


@pytest.mark.asyncio
async def test_cancel_occurrence_keeps_cursor_and_moves_prepared_date(monkeypatch) -> None:
    goals = _schedule_goals()
    locked_user = User(id=uuid.uuid4(), goals=goals, anthropometry={})
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[locked_user, None])
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    reset_days = AsyncMock()
    monkeypatch.setattr(supplement_intakes, "reset_pending_days", reset_days)

    overview = await cancel_workout_occurrence(
        session,
        locked_user,
        scheduled_date=date(2026, 8, 28),
        now=datetime(2026, 8, 28, 5, 0, tzinfo=timezone(timedelta(hours=3))),
    )

    cancellation = locked_user.goals["workout_schedule_cancellations"][0]
    assert cancellation["scheduled_date"] == "2026-08-28"
    assert cancellation["next_date"] == "2026-08-31"
    assert locked_user.goals["active_program_next_day"] == 3
    assert overview["current"]["status"] == "cancelled"
    assert overview["next"]["target_date"] == date(2026, 8, 31)
    assert overview["next"]["day_index"] == 3
    session.execute.assert_awaited_once()
    reset_days.assert_awaited_once_with(
        session,
        locked_user,
        {date(2026, 8, 28), date(2026, 8, 31)},
    )


@pytest.mark.asyncio
async def test_reschedule_rejects_next_regular_day() -> None:
    locked_user = User(id=uuid.uuid4(), goals=_schedule_goals(), anthropometry={})
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=locked_user)

    with pytest.raises(HTTPException, match="не позднее"):
        await reschedule_workout_occurrence(
            session,
            locked_user,
            original_date=date(2026, 8, 21),
            target_date=date(2026, 8, 24),
            target_time=time(6, 15),
            now=datetime(2026, 8, 21, 12, 0, tzinfo=timezone(timedelta(hours=3))),
        )
