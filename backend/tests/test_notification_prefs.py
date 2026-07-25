"""Unit tests for notification preference due windows."""

from datetime import datetime, timedelta, timezone

from app.services.notification_prefs import apply_state_updates, due_notifications


def test_workout_due_on_configured_day() -> None:
    tz = timezone(timedelta(hours=3))
    # Monday 18:30
    now = datetime(2026, 7, 20, 18, 30, tzinfo=tz)
    goals = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "workouts": {"enabled": True, "time": "18:30", "days": [0]},
            "measurements": {"enabled": False},
            "supplements": {"enabled": False},
        }
    }
    due = due_notifications(goals, now=now, window_minutes=5)
    assert any(d["kind"] == "workout" for d in due)


def test_supplement_mark_applied() -> None:
    from datetime import date

    today = date.today().isoformat()
    mark = f"sup:creatine:{today}:10:00"
    goals = {"notification_state": {}}
    items = [
        {
            "kind": "supplement",
            "state_key": "supplement_mark",
            "state_value": mark,
        }
    ]
    updated = apply_state_updates(goals, items)
    assert mark in updated["notification_state"]["supplement_marks"]
