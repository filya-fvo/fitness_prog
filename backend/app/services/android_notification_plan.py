"""Read-only projection of shared schedules for bounded offline delivery."""

from datetime import UTC, date, datetime, time, timedelta
import hashlib
import json

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.body_measurement import BodyMeasurement
from app.models.supplement_intake import SupplementIntake
from app.models.user import User
from app.models.workout import Workout
from app.schemas.android_notifications import (
    AndroidNotificationPlan,
    AndroidReminder,
    AndroidReminderContext,
)
from app.services import supplement_intakes, workout_notifications
from app.services.notification_calendar import resolve_local_slot
from app.services.notification_prefs import (
    _resolve_tz,
    merge_notification_settings,
    parse_hhmm,
    water_ml_for_day,
    water_slots,
)

SOURCE_GOALS = (
    "workout_schedule", "workout_days", "workout_start_time", "workout_schedule_history",
    "workout_schedule_time_history", "workout_schedule_overrides", "workout_schedule_cancellations",
    "workout_schedule_assignments", "workout_illness_periods", "active_program_started_at",
    "active_program_id", "active_program_next_day", "supplements", "notification_state", "water_log",
)


def _date(value) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


async def build_android_notification_plan(
    session: AsyncSession, user: User, *, now: datetime
) -> AndroidNotificationPlan:
    if now.tzinfo is None:
        raise ValueError("Timezone required")
    now = now.astimezone(UTC)
    goals = user.goals or {}
    settings = merge_notification_settings(goals.get("notification_settings"))
    timezone_name = settings["timezone"]
    zone = _resolve_tz(timezone_name)
    first = now.astimezone(zone).date()
    end_day = first + timedelta(days=14)
    start = resolve_local_slot(first, time.min, timezone_name)
    until = resolve_local_slot(end_day, time.min, timezone_name)
    # Select only immutable source columns: no relationship loaders or materialization.
    workouts = (await session.execute(select(
        Workout.scheduled_date, Workout.status, Workout.started_at
    ).where(
        Workout.user_id == user.id, Workout.is_deleted.is_(False),
        Workout.scheduled_date >= first, Workout.scheduled_date <= end_day,
    ))).all()
    measurements = (await session.execute(select(BodyMeasurement.date).where(
        BodyMeasurement.user_id == user.id, BodyMeasurement.is_deleted.is_(False),
        BodyMeasurement.date < end_day,
    ).order_by(BodyMeasurement.date.desc()).limit(1))).all()
    intakes = (await session.execute(select(
        SupplementIntake.supplement_entry_id, SupplementIntake.scheduled_at,
        SupplementIntake.status, SupplementIntake.snoozed_until, SupplementIntake.notified_at,
    ).where(
        SupplementIntake.user_id == user.id, SupplementIntake.is_deleted.is_(False),
        SupplementIntake.scheduled_at >= start, SupplementIntake.scheduled_at < until,
    ))).all()
    blocked_workouts = {row[0] for row in workouts if row[1] != "planned" or row[2] is not None}
    intake_state = {(row[0], row[1].astimezone(UTC)): row for row in intakes}
    state = goals.get("notification_state") or {}
    last_measurement = max(filter(None, [
        _date(state.get("last_measurement_date")),
        measurements[0][0] if measurements else None,
    ]), default=None)
    events: dict[str, AndroidReminder] = {}

    def add(key, category, due, expiry, route, context=None):
        if not start <= due < until or expiry <= now:
            return
        try:
            events[key] = AndroidReminder(
                key=key, category=category, due_at=due, expires_at=min(expiry, until),
                local_date=due.astimezone(zone).date(), route=route,
                context=AndroidReminderContext(**(context or {})),
            )
        except ValidationError as exc:
            raise HTTPException(422, "Не удалось подготовить полный план напоминаний") from exc
        if len(events) > 2048:
            raise HTTPException(422, "Не удалось подготовить полный план напоминаний")

    for offset in range(15):
        day = first + timedelta(days=offset)
        day_end = resolve_local_slot(day + timedelta(days=1), time.min, timezone_name)
        occurrence = workout_notifications.android_occurrence(goals, day, timezone_name)
        if settings["workouts"]["enabled"] and occurrence and day not in blocked_workouts:
            key, due, starts_at, zero_lead = occurrence
            if state.get("last_workout_mark") != key:
                add(key, "workouts", due, starts_at + timedelta(minutes=7) if zero_lead else starts_at,
                    "workouts", {"occurrence_date": day, "occurrence_key": key,
                                 "starts_at": starts_at, "zero_lead": zero_lead})
        if day >= end_day:
            continue
        if settings["supplements"]["enabled"]:
            groups: dict[datetime, set[str]] = {}
            for row in supplement_intakes.scheduled_rows(user, day):
                stamp = row["scheduled_at"]
                prior = intake_state.get((row["supplement_entry_id"], stamp))
                if prior and (prior[2] != "pending" or prior[4] is not None):
                    continue
                if prior and prior[3]:
                    stamp = prior[3].astimezone(UTC)
                groups.setdefault(stamp, set()).add(row["supplement_entry_id"])
            for stamp, entries in groups.items():
                add(f"supplements:{stamp.isoformat()}", "supplements", stamp, day_end,
                    "supplements", {"supplement_entry_ids": sorted(entries)})
        cfg = settings["water"]
        if cfg["enabled"] and water_ml_for_day(goals, day) < cfg["daily_ml"]:
            marks = state.get("water_marks") or {}
            for slot in water_slots(parse_hhmm(cfg["start_time"]), parse_hhmm(cfg["end_time"]),
                                    cfg["interval_minutes"]):
                key = f"water:{day.isoformat()}:{slot.strftime('%H:%M')}"
                if not marks.get(key):
                    add(key, "water", resolve_local_slot(day, slot, timezone_name), day_end,
                        "home", {"slot": slot.strftime("%H:%M")})
        if settings["calories"]["enabled"]:
            for slot in settings["calories"]["times"]:
                key = f"cal:{day.isoformat()}:{slot}"
                if not (state.get("cal_marks") or {}).get(key):
                    add(key, "calories", resolve_local_slot(day, parse_hhmm(slot), timezone_name),
                        day_end, "nutrition", {"slot": slot})
        cfg = settings["measurements"]
        if (cfg["enabled"] and (cfg["weekday"] is None or day.weekday() == cfg["weekday"])
                and (last_measurement is None or (day - last_measurement).days >= cfg["interval_days"])):
            key = f"meas:{day.isoformat()}"
            if state.get("last_measurement_mark") != key:
                add(key, "measurements", resolve_local_slot(day, parse_hhmm(cfg["time"]), timezone_name),
                    day_end, "measurements")
            last_measurement = day  # Virtual projection only, never user.goals.
    source = {
        "owner": str(user.id), "start": first.isoformat(), "end": end_day.isoformat(),
        "settings": settings, "goals": {key: goals.get(key) for key in SOURCE_GOALS},
        "workouts": sorted([list(row) for row in workouts], key=str),
        "measurements": [list(row) for row in measurements],
        "intakes": sorted([list(row) for row in intakes], key=str),
    }
    revision = hashlib.sha256(json.dumps(source, sort_keys=True, default=str,
                                        separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    try:
        return AndroidNotificationPlan(
            owner=user.id, settings_revision=revision, generated_at=now, valid_until=until,
            timezone=timezone_name, catch_up=settings["catch_up"], quiet_hours=settings["quiet_hours"],
            events=sorted(events.values(), key=lambda event: (event.due_at, event.key)),
        )
    except ValidationError as exc:
        raise HTTPException(422, "Не удалось подготовить полный план напоминаний") from exc
