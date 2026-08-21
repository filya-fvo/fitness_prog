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
    user = SimpleNamespace(id="user-1", goals=_schedule_goals())

    overview = await get_schedule_overview(session, user, date(2026, 8, 22))

    assert overview["current"] is None
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
