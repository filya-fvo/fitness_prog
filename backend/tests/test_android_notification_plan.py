"""Android preparation is bounded and never materializes the diary."""

from copy import deepcopy
from datetime import UTC, date, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest


@pytest.mark.asyncio
async def test_plan_is_read_only_and_prepares_14_local_dates(monkeypatch):
    from app.services import android_notification_plan as service
    from app.services import supplement_intakes

    user = SimpleNamespace(id=uuid4(), goals={})
    original_goals = deepcopy(user.goals)
    session = AsyncMock()
    session.add = Mock()
    session.execute.return_value.all = Mock(return_value=[])
    materialize = AsyncMock()
    monkeypatch.setattr(supplement_intakes, "ensure_day", materialize)
    plan = await service.build_android_notification_plan(
        session, user, now=datetime(2026, 10, 10, 7, tzinfo=UTC)
    )
    assert plan.owner == user.id
    assert plan.valid_until.isoformat() == "2026-10-23T21:00:00+00:00"
    assert user.goals == original_goals
    session.add.assert_not_called()
    session.commit.assert_not_awaited()
    session.delete.assert_not_awaited()
    materialize.assert_not_awaited()
    assert plan.events == sorted(plan.events, key=lambda event: (event.due_at, event.key))


def empty_session(*sources):
    session = AsyncMock()
    session.add = Mock()
    session.execute.side_effect = [SimpleNamespace(all=lambda rows=rows: rows) for rows in (sources or ([], [], []))]
    return session


def make_user(**goals):
    return SimpleNamespace(id=uuid4(), goals=goals)


async def prepare(user, session=None, now=None):
    from app.services.android_notification_plan import build_android_notification_plan
    return await build_android_notification_plan(
        session or empty_session(), user, now=now or datetime(2026, 10, 10, 7, tzinfo=UTC)
    )


@pytest.mark.asyncio
async def test_slots_respect_reschedule_cancel_illness_program_start():
    user = make_user(
        active_program_started_at="2026-10-12",
        workout_schedule={"days": list(range(7)), "start_time": "18:30"},
        workout_schedule_overrides=[{"original_date": "2026-10-12", "target_date": "2026-10-13", "target_time": "19:00"}],
        workout_schedule_cancellations=[{"scheduled_date": "2026-10-14"}],
        workout_illness_periods=[{"started_on": "2026-10-15", "ended_on": "2026-10-16"}],
    )
    session = empty_session([(date(2026, 10, 17), "completed", None), (date(2026, 10, 18), "planned", datetime.now(UTC))], [], [])
    plan = await prepare(user, session)
    rows = [event for event in plan.events if event.category == "workouts"]
    assert rows[0].key == "workout:2026-10-12:2026-10-13:19:00"
    assert {event.context.occurrence_date.day for event in rows} == {13, 19, 20, 21, 22, 23}
    for call in session.execute.await_args_list:
        statement = str(call.args[0])
        assert "user_id =" in statement and "is_deleted IS false" in statement
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_water_30_minute_slots_fit_limit():
    user = make_user(notification_settings={"water": {
        "enabled": True, "interval_minutes": 30, "start_time": "00:00", "end_time": "23:59"
    }})
    plan = await prepare(user)
    water = [event for event in plan.events if event.category == "water"]
    assert len(water) == 14 * 48
    assert len(plan.events) < 2048
    assert len({event.key for event in water}) == len(water)
    assert all(event.local_date == event.due_at.astimezone(ZoneInfo(plan.timezone)).date() for event in water)


@pytest.mark.asyncio
async def test_measurement_interval_is_projected_without_writes():
    user = make_user(notification_settings={"measurements": {"weekday": None, "interval_days": 3}})
    original = deepcopy(user.goals)
    session = empty_session([], [(date(2026, 10, 9),)], [])
    plan = await prepare(user, session)
    assert [event.local_date.day for event in plan.events if event.category == "measurements"] == [12, 15, 18, 21]
    assert all(event.context.occurrence_key == "measurement:2026-10-09" for event in plan.events if event.category == "measurements")
    assert user.goals == original
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_keys_survive_settings_revision_changes():
    user = make_user()
    first = await prepare(user)
    same = await prepare(user, now=datetime(2026, 10, 10, 7, 1, tzinfo=UTC))
    assert same.settings_revision == first.settings_revision
    user.goals["notification_settings"] = {"quiet_hours": {"enabled": True}}
    changed = await prepare(user)
    assert changed.settings_revision != first.settings_revision
    assert [event.key for event in first.events] == [event.key for event in changed.events]


@pytest.mark.asyncio
async def test_taken_skipped_snoozed_supplements_are_read_without_materialization():
    user = make_user(supplements=[{
        "id": ident, "key": ident, "schedule": [{"slot": "12:00", "days": "every"}]
    } for ident in ["taken", "skipped", "pending", "later"]])
    stamp = datetime(2026, 10, 10, 9, tzinfo=UTC)
    later = stamp + timedelta(hours=1)
    session = empty_session([], [], [
        ("taken", stamp, "taken", None, None), ("skipped", stamp, "skipped", None, None),
        ("later", stamp, "pending", later, None),
    ])
    plan = await prepare(user, session)
    rows = [event for event in plan.events if event.category == "supplements" and event.local_date.day == 10]
    assert [(event.due_at, event.context.supplement_entry_ids) for event in rows] == [(stamp, ["pending"]), (later, ["later"])]
    session.commit.assert_not_awaited()


def test_plan_rejects_2049_events_or_1mib_without_partial_success():
    from pydantic import ValidationError
    from app.schemas.android_notifications import AndroidNotificationPlan, AndroidReminder
    instant = datetime(2026, 10, 10, 9, tzinfo=UTC)
    def payload(count, large=False):
        return dict(owner=uuid4(), settings_revision="a" * 64,
                    generated_at=instant, valid_until=instant + timedelta(days=1),
                    timezone="Europe/Moscow", catch_up=True,
                    quiet_hours={"enabled": False, "start_time": "22:00", "end_time": "08:00"},
                    events=[AndroidReminder(key=f"water:{index:04d}", category="water", due_at=instant,
                                            expires_at=instant + timedelta(hours=1), local_date=instant.date(),
                                            route="home", context={"supplement_entry_ids": ["x" * 200] * 500} if large else {})
                            for index in range(count)])
    with pytest.raises(ValidationError):
        AndroidNotificationPlan(**payload(2049))
    with pytest.raises(ValidationError, match="too large"):
        AndroidNotificationPlan(**payload(11, True))


def test_dst_gap_and_fold_resolve_once_to_valid_instant():
    from app.services.notification_calendar import resolve_local_slot
    assert resolve_local_slot(date(2026, 3, 29), time(2, 30), "Europe/Berlin") == datetime(2026, 3, 29, 1, tzinfo=UTC)
    assert resolve_local_slot(date(2026, 10, 25), time(2, 30), "Europe/Berlin") == datetime(2026, 10, 25, 0, 30, tzinfo=UTC)


@pytest.mark.asyncio
async def test_dst_gap_fold_and_cross_midnight_lead():
    user = make_user(workout_schedule={"days": list(range(7)), "start_time": "00:30"},
                     notification_settings={"timezone": "Europe/Berlin", "workouts": {"remind_before_minutes": 60}})
    plan = await prepare(user, now=datetime(2026, 10, 24, 10, tzinfo=UTC))
    event = next(event for event in plan.events if event.key == "workout:2026-10-25:2026-10-25:00:30")
    assert event.local_date == date(2026, 10, 24)
    assert event.context.occurrence_date == date(2026, 10, 25)
    assert event.expires_at == event.context.starts_at
    assert event.context.zero_lead is False


@pytest.mark.asyncio
async def test_zero_lead_normal_alarm_grace_is_not_reboot_catchup():
    user = make_user(workout_schedule={"days": list(range(7)), "start_time": "10:00"})
    plan = await prepare(user)
    event = next(event for event in plan.events if event.category == "workouts")
    assert event.context.starts_at == datetime(2026, 10, 10, 7, tzinfo=UTC)
    assert event.context.zero_lead is True
    assert event.expires_at == event.context.starts_at + timedelta(minutes=7)
    # Native selection uses starts_at + zero_lead to distinguish ALARM from RESTORE.


@pytest.mark.asyncio
async def test_water_goal_and_existing_legacy_marks_are_respected():
    user = make_user(notification_settings={"water": {"enabled": True}, "calories": {"enabled": True}},
                     water_log={"2026-10-10": 2500},
                     notification_state={"cal_marks": {"cal:2026-10-10:14:00": True}})
    plan = await prepare(user)
    assert not [event for event in plan.events if event.category == "water" and event.local_date.day == 10]
    assert "cal:2026-10-10:14:00" not in {event.key for event in plan.events}


def test_android_plan_route_is_owner_bound_and_read_only():
    from app.main import app
    path = app.openapi()["paths"]["/notifications/android-plan"]
    assert set(path) == {"get"}
    assert not path["get"].get("parameters")


def test_supplement_projection_resolves_nonexistent_local_time():
    from app.services.supplement_intakes import scheduled_rows
    user = make_user(notification_settings={"timezone": "Europe/Berlin"}, supplements=[{
        "id": "test", "schedule": [{"slot": "02:30", "days": "every"}]
    }])
    row = scheduled_rows(user, date(2026, 3, 29))[0]
    assert row["scheduled_at"] == datetime(2026, 3, 29, 1, tzinfo=UTC)


@pytest.mark.asyncio
async def test_oversized_supplement_group_returns_safe_preparation_error():
    from fastapi import HTTPException
    user = make_user(supplements=[{
        "id": f"supplement-{index}", "schedule": [{"slot": "12:00", "days": "every"}]
    } for index in range(501)])
    session = empty_session()
    with pytest.raises(HTTPException) as failure:
        await prepare(user, session)
    assert failure.value.status_code == 422
    assert failure.value.detail == "Не удалось подготовить полный план напоминаний"
    session.commit.assert_not_awaited()
