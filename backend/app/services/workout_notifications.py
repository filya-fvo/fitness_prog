"""Workout reminder calculation for recurring and rescheduled occurrences."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.services.notification_prefs import merge_notification_settings, parse_hhmm
from app.services.scheduler import (
    _fallback_title,
    _cancellation_for_day,
    _override_for_original,
    _schedule_timezone,
    effective_workout_context,
    workout_days,
    workout_lead_minutes,
    workout_start_time,
)


def due_workout_notification(
    goals: dict[str, Any],
    *,
    now: datetime | None = None,
    window_minutes: int = 7,
    catch_up: bool | None = None,
) -> dict[str, Any] | None:
    settings_raw = goals.get("notification_settings")
    settings = merge_notification_settings(settings_raw if isinstance(settings_raw, dict) else None)
    workout_cfg = settings.get("workouts") or {}
    if not bool(workout_cfg.get("enabled")) or not workout_days(goals):
        return None
    tz = _schedule_timezone(goals)
    local_now = (now or datetime.now(UTC)).astimezone(tz)
    use_catch_up = bool(settings.get("catch_up", True)) if catch_up is None else bool(catch_up)
    lead = workout_lead_minutes(goals)
    state = goals.get("notification_state") if isinstance(goals.get("notification_state"), dict) else {}
    last_mark = str((state or {}).get("last_workout_mark") or "")

    candidates: list[tuple[datetime, date, dict[str, Any]]] = []
    days = workout_days(goals)
    for offset in range(-7, 9):
        original = local_now.date() + timedelta(days=offset)
        if original.weekday() not in days:
            continue
        if _cancellation_for_day(goals, original) is not None:
            continue
        override = _override_for_original(goals, original)
        target_date = date.fromisoformat(str(override["target_date"])) if override else original
        start = parse_hhmm(str((override or {}).get("target_time") or "")) or workout_start_time(goals)
        starts_at = datetime.combine(target_date, start, tzinfo=tz)
        if starts_at < local_now:
            continue
        reminder_at = starts_at - timedelta(minutes=lead)
        elapsed = (local_now - reminder_at).total_seconds()
        is_due = elapsed >= 0 if use_catch_up else 0 <= elapsed <= window_minutes * 60
        if is_due:
            candidates.append((starts_at, original, override or {}))
    if not candidates:
        return None
    starts_at, original, override = min(candidates, key=lambda item: item[0])
    mark = f"workout:{original.isoformat()}:{starts_at.date().isoformat()}:{starts_at.strftime('%H:%M')}"
    if last_mark == mark:
        return None
    title = _fallback_title(goals, override)
    when = (
        "Сегодня"
        if starts_at.date() == local_now.date()
        else "Завтра"
        if starts_at.date() == local_now.date() + timedelta(days=1)
        else starts_at.strftime("%d.%m")
    )
    return {
        "kind": "workout",
        "title": "Напоминание о тренировке",
        "text": (
            f"{when} в {starts_at.strftime('%H:%M')} — {title}. "
            "Откройте приложение, когда будете готовы начать."
        ),
        "startapp": "home",
        "state_key": "last_workout_mark",
        "state_value": mark,
        "meta": {
            "program_id": str(override.get("program_id") or goals.get("active_program_id") or ""),
            "day_index": override.get("day_index") or goals.get("active_program_next_day"),
            "workout_title": title,
            "original_date": original.isoformat(),
            "target_date": starts_at.date().isoformat(),
            "start_time": starts_at.strftime("%H:%M"),
        },
    }


def mark_occurrence_started(goals: dict[str, Any], workout_day: date) -> dict[str, Any]:
    context = effective_workout_context(goals, workout_day)
    if not context["is_workout_day"]:
        return goals
    original = context["original_date"]
    target = context["target_date"]
    start = context["start_time"]
    mark = f"workout:{original.isoformat()}:{target.isoformat()}:{start.strftime('%H:%M')}"
    updated = dict(goals or {})
    state = dict(updated.get("notification_state") or {})
    state["last_workout_mark"] = mark
    updated["notification_state"] = state
    return updated
