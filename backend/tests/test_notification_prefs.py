"""Unit tests for notification preference due windows."""

from datetime import date, datetime, time, timedelta, timezone

from app.services.notification_prefs import (
    add_water_from_telegram_callback,
    apply_state_updates,
    due_notifications,
    format_calorie_reminder_text,
    merge_notification_settings,
    set_water_ml_for_day,
    water_ml_for_day,
    water_slots,
)


def test_service_email_consent_is_opt_in_and_preserved() -> None:
    defaults = merge_notification_settings(None)
    opted_in = merge_notification_settings(
        {"service_messages": {"email_enabled": True}}
    )

    assert defaults["service_messages"]["email_enabled"] is False
    assert opted_in["service_messages"]["email_enabled"] is True


def test_workout_due_on_configured_day() -> None:
    tz = timezone(timedelta(hours=3))
    now = datetime(2026, 7, 20, 18, 30, tzinfo=tz)
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": False,
            "workouts": {"enabled": True, "time": "18:30", "days": [0]},
            "measurements": {"enabled": False},
            "supplements": {"enabled": False},
            "water": {"enabled": False},
            "calories": {"enabled": False},
        }
    }
    due = due_notifications(goals, now=now, window_minutes=5)
    assert any(d["kind"] == "workout" for d in due)


def test_supplement_mark_applied() -> None:
    today = date.today().isoformat()
    mark = f"sup:creatine:{today}:10:00"
    goals = {"notification_state": {}}
    items = [{"kind": "supplement", "state_key": "supplement_mark", "state_value": mark}]
    updated = apply_state_updates(goals, items)
    assert mark in updated["notification_state"]["supplement_marks"]


def test_catch_up_sends_after_missed_window() -> None:
    tz = timezone(timedelta(hours=3))
    now = datetime(2026, 7, 20, 12, 15, tzinfo=tz)
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": True,
            "workouts": {"enabled": False},
            "measurements": {"enabled": True, "time": "10:00", "interval_days": 1, "weekday": None},
            "supplements": {"enabled": False},
            "water": {"enabled": False},
            "calories": {"enabled": False},
        }
    }
    due = due_notifications(goals, now=now, window_minutes=5)
    assert any(d["kind"] == "measurements" for d in due)
    goals["notification_settings"]["catch_up"] = False
    due2 = due_notifications(goals, now=now, window_minutes=5, catch_up=False)
    assert not any(d["kind"] == "measurements" for d in due2)


def test_water_slots_and_due() -> None:
    slots = water_slots(time(9, 0), time(13, 0), 120)
    assert [s.strftime("%H:%M") for s in slots] == ["09:00", "11:00", "13:00"]
    tz = timezone(timedelta(hours=3))
    now = datetime(2026, 7, 20, 11, 2, tzinfo=tz)
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": False,
            "workouts": {"enabled": False},
            "measurements": {"enabled": False},
            "supplements": {"enabled": False},
            "water": {
                "enabled": True,
                "daily_ml": 2500,
                "interval_minutes": 120,
                "start_time": "09:00",
                "end_time": "13:00",
            },
            "calories": {"enabled": False},
        },
        "water_log": {"2026-07-20": 500},
    }
    due = due_notifications(goals, now=now, window_minutes=5)
    water = [d for d in due if d["kind"] == "water"]
    assert water
    assert "500" in water[0]["text"]
    assert water[0]["meta"]["left_ml"] == 2000
    assert water[0]["meta"]["date"] == "2026-07-20"
    assert water[0]["startapp"] == "water"


def test_water_log_helpers() -> None:
    g = set_water_ml_for_day({}, "2026-07-20", 750)
    assert water_ml_for_day(g, "2026-07-20") == 750


def test_telegram_water_callback_is_idempotent_and_bound_to_its_day() -> None:
    goals = {"water_log": {"2026-07-20": 500, "2026-07-21": 0}}

    updated, total, applied = add_water_from_telegram_callback(
        goals, "2026-07-20", 250, "callback-1"
    )
    replayed, replay_total, replay_applied = add_water_from_telegram_callback(
        updated, "2026-07-20", 250, "callback-1"
    )

    assert (total, applied) == (750, True)
    assert (replay_total, replay_applied) == (750, False)
    assert water_ml_for_day(replayed, "2026-07-20") == 750
    assert water_ml_for_day(replayed, "2026-07-21") == 0


def test_telegram_water_callback_history_is_bounded() -> None:
    goals: dict = {}
    for index in range(120):
        goals, _, _ = add_water_from_telegram_callback(
            goals, "2026-07-20", 250, f"callback-{index}"
        )

    callback_ids = goals["notification_state"]["telegram_water_callback_ids"]
    assert len(callback_ids) == 100
    assert callback_ids[0] == "callback-20"


def test_calorie_text_deficit_surplus() -> None:
    assert "Недобор" in format_calorie_reminder_text(eaten=1200, target=2000, slot="14:00")
    assert "Перебор" in format_calorie_reminder_text(eaten=2500, target=2000, slot="20:00")


def test_calories_due_mark() -> None:
    # Use "today" so prune window (3 days) keeps the mark.
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz).replace(hour=20, minute=0, second=0, microsecond=0)
    day = now.date().isoformat()
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": False,
            "workouts": {"enabled": False},
            "measurements": {"enabled": False},
            "supplements": {"enabled": False},
            "water": {"enabled": False},
            "calories": {"enabled": True, "times": ["20:00"]},
        }
    }
    due = due_notifications(goals, now=now, window_minutes=5)
    assert any(d["kind"] == "calories" for d in due)
    updated = apply_state_updates(goals, due)
    marks = updated["notification_state"]["calorie_marks"]
    assert any(day in k for k in marks)


def test_water_catch_up_collapses_to_one_digest() -> None:
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz).replace(hour=15, minute=0, second=0, microsecond=0)
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": True,
            "workouts": {"enabled": False},
            "measurements": {"enabled": False},
            "supplements": {"enabled": False},
            "water": {
                "enabled": True,
                "daily_ml": 2500,
                "interval_minutes": 120,
                "start_time": "09:00",
                "end_time": "21:00",
            },
            "calories": {"enabled": False},
        }
    }
    due = due_notifications(goals, now=now, window_minutes=5)
    water = [d for d in due if d["kind"] == "water"]
    assert len(water) == 1
    assert water[0]["meta"].get("digest") is True
    assert len(water[0].get("state_values") or []) >= 2
    updated = apply_state_updates(goals, due)
    assert len(updated["notification_state"]["water_marks"]) >= 2
    again = due_notifications(updated, now=now, window_minutes=5)
    assert not any(d["kind"] == "water" for d in again)


def test_supplement_schedule_workout_day_only() -> None:
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz).replace(hour=17, minute=45, second=0, microsecond=0)
    wd = now.weekday()
    base = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": False,
            "workouts": {"enabled": True, "time": "18:30", "days": [wd]},
            "measurements": {"enabled": False},
            "supplements": {"enabled": True},
            "water": {"enabled": False},
            "calories": {"enabled": False},
        },
        "supplements": [
            {
                "id": "caf",
                "key": "caffeine",
                "name_ru": "Кофеин",
                "dose": "200 мг",
                "enabled": True,
                "schedule": [{"slot": "pre_workout", "days": "workout"}],
                "times": ["pre_workout"],
            }
        ],
    }
    due = due_notifications(base, now=now, window_minutes=5)
    assert any(d["kind"] == "supplement" for d in due)
    base["notification_settings"]["workouts"]["days"] = [(wd + 1) % 7]
    due2 = due_notifications(base, now=now, window_minutes=5)
    assert not any(d["kind"] == "supplement" for d in due2)


def test_supplement_schedule_rest_day_only() -> None:
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz).replace(hour=7, minute=0, second=0, microsecond=0)
    wd = now.weekday()
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": False,
            "workouts": {"enabled": True, "time": "18:30", "days": [(wd + 1) % 7]},
            "measurements": {"enabled": False},
            "supplements": {"enabled": True},
            "water": {"enabled": False},
            "calories": {"enabled": False},
        },
        "supplements": [
            {
                "id": "prot",
                "key": "whey_protein",
                "name_ru": "Протеин",
                "dose": "30 г",
                "enabled": True,
                "schedule": [{"slot": "07:00", "days": "rest"}],
                "times": ["07:00"],
            }
        ],
    }
    # Today is rest day -> due
    due = due_notifications(goals, now=now, window_minutes=5)
    assert any(d["kind"] == "supplement" for d in due)
    # Make today a workout day -> not due
    goals["notification_settings"]["workouts"]["days"] = [wd]
    due2 = due_notifications(goals, now=now, window_minutes=5)
    assert not any(d["kind"] == "supplement" for d in due2)

def test_water_skips_when_daily_goal_met() -> None:
    """No water pings after drunk_ml >= daily_ml (user report: 4500/4500 still got 19:00)."""
    tz = timezone(timedelta(hours=3))
    now = datetime(2026, 7, 20, 19, 0, tzinfo=tz)
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "catch_up": False,
            "workouts": {"enabled": False},
            "measurements": {"enabled": False},
            "supplements": {"enabled": False},
            "water": {
                "enabled": True,
                "daily_ml": 4500,
                "interval_minutes": 30,
                "start_time": "09:00",
                "end_time": "21:00",
            },
            "calories": {"enabled": False},
        },
        "water_log": {"2026-07-20": 4500},
    }
    due = due_notifications(goals, now=now, window_minutes=5)
    assert not any(d["kind"] == "water" for d in due)

    # Still under goal -> slot fires
    goals["water_log"]["2026-07-20"] = 3000
    due2 = due_notifications(goals, now=now, window_minutes=5)
    water = [d for d in due2 if d["kind"] == "water"]
    assert water
    assert water[0]["meta"]["left_ml"] == 1500
    assert "Осталось" in water[0]["text"]
    assert "выполнена" not in water[0]["text"]

