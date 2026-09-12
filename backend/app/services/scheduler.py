"""Recurring workout schedule and one-off occurrence rescheduling."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan_override import WorkoutPlanOverride
from app.services.notification_prefs import _resolve_tz, merge_notification_settings, parse_hhmm

OVERRIDES_KEY = "workout_schedule_overrides"
CANCELLATIONS_KEY = "workout_schedule_cancellations"
SCHEDULE_HISTORY_KEY = "workout_schedule_history"
SCHEDULE_TIME_HISTORY_KEY = "workout_schedule_time_history"
SCHEDULE_SETTINGS_KEY = "workout_schedule"
SCHEDULE_SETTINGS_VERSION = 1
MAX_RESCHEDULE_LOOKBACK_DAYS = 6
MAX_NOTIFICATION_LEAD_MINUTES = 24 * 60
SCHEDULE_HISTORY_RETENTION_DAYS = 35
MAX_SCHEDULE_HISTORY_VERSIONS = 64


@dataclass(frozen=True, slots=True)
class WorkoutScheduleSlot:
    original_date: date
    target_date: date
    is_rescheduled: bool
    is_cancelled: bool


def _workout_settings(goals: dict[str, Any]) -> dict[str, Any]:
    raw = goals.get("notification_settings")
    settings = merge_notification_settings(raw if isinstance(raw, dict) else None)
    value = settings.get("workouts")
    return dict(value) if isinstance(value, dict) else {}


def _normalized_weekdays(raw: Any) -> set[int]:
    days: set[int] = set()
    for value in raw if isinstance(raw, list) else []:
        try:
            weekday = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= weekday <= 6:
            days.add(weekday)
    return days


def workout_schedule_settings(goals: dict[str, Any]) -> dict[str, Any]:
    """Return the domain schedule, falling back to every supported legacy shape."""

    canonical = goals.get(SCHEDULE_SETTINGS_KEY)
    canonical = canonical if isinstance(canonical, dict) else {}
    raw_notifications = goals.get("notification_settings")
    raw_notifications = raw_notifications if isinstance(raw_notifications, dict) else {}
    raw_workouts = raw_notifications.get("workouts")
    legacy_workouts = raw_workouts if isinstance(raw_workouts, dict) else {}

    raw_days = canonical.get("days")
    if not isinstance(raw_days, list):
        raw_days = legacy_workouts.get("days")
    if not isinstance(raw_days, list):
        raw_days = goals.get("workout_days")
    if not isinstance(raw_days, list):
        raw_days = [0, 2, 4]

    raw_time = canonical.get("start_time")
    if not raw_time:
        raw_time = legacy_workouts.get("time")
    if not raw_time:
        raw_time = goals.get("workout_start_time")
    start = parse_hhmm(str(raw_time or "18:30")) or time(18, 30)
    try:
        revision = max(1, int(canonical.get("revision") or 1))
    except (TypeError, ValueError):
        revision = 1
    try:
        effective_from = date.fromisoformat(str(canonical.get("effective_from")))
    except (TypeError, ValueError):
        effective_from = None

    return {
        "version": SCHEDULE_SETTINGS_VERSION,
        "revision": revision,
        "days": sorted(_normalized_weekdays(raw_days)),
        "start_time": start.strftime("%H:%M"),
        "effective_from": effective_from,
    }


def workout_days(goals: dict[str, Any]) -> set[int]:
    return set(workout_schedule_settings(goals)["days"])


def _schedule_history(goals: dict[str, Any]) -> list[tuple[date, set[int]]]:
    raw = goals.get(SCHEDULE_HISTORY_KEY)
    if not isinstance(raw, list):
        return []
    versions: dict[date, set[int]] = {}
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get("days"), list):
            continue
        try:
            effective_from = date.fromisoformat(str(item.get("effective_from")))
        except ValueError:
            continue
        days: set[int] = set()
        for value in item["days"]:
            try:
                weekday = int(value)
            except (TypeError, ValueError):
                continue
            if 0 <= weekday <= 6:
                days.add(weekday)
        versions[effective_from] = days
    return sorted(versions.items())


def workout_days_on(goals: dict[str, Any], day: date) -> set[int]:
    """Return schedule weekdays that were effective on a historical date."""

    selected = workout_days(goals)
    for effective_from, days in _schedule_history(goals):
        if effective_from > day:
            break
        selected = days
    return selected


def record_workout_schedule_change(
    goals: dict[str, Any],
    *,
    previous_days: set[int],
    new_days: set[int],
    effective_from: date,
    tracking_start: date,
) -> dict[str, Any]:
    """Persist invisible schedule versions used by personal analytics."""

    if previous_days == new_days:
        return goals
    versions = dict(_schedule_history(goals))
    if not versions:
        versions[tracking_start] = set(previous_days)
    versions[effective_from] = set(new_days)
    rows = sorted(versions.items())[-MAX_SCHEDULE_HISTORY_VERSIONS:]
    return {
        **goals,
        SCHEDULE_HISTORY_KEY: [
            {"effective_from": version_date.isoformat(), "days": sorted(days)}
            for version_date, days in rows
        ],
    }


def _schedule_time_history(goals: dict[str, Any]) -> list[tuple[date, time]]:
    raw = goals.get(SCHEDULE_TIME_HISTORY_KEY)
    if not isinstance(raw, list):
        return []
    versions: dict[date, time] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            effective_from = date.fromisoformat(str(item.get("effective_from")))
        except ValueError:
            continue
        parsed = parse_hhmm(str(item.get("start_time") or ""))
        if parsed is not None:
            versions[effective_from] = parsed
    return sorted(versions.items())


def workout_start_time_on(goals: dict[str, Any], day: date) -> time:
    """Return the start time effective on a local calendar day."""

    selected = workout_start_time(goals)
    for effective_from, start in _schedule_time_history(goals):
        if effective_from > day:
            break
        selected = start
    return selected


def record_workout_schedule_time_change(
    goals: dict[str, Any],
    *,
    previous_start_time: time,
    new_start_time: time,
    effective_from: date,
    tracking_start: date,
) -> dict[str, Any]:
    if previous_start_time == new_start_time:
        return goals
    versions = dict(_schedule_time_history(goals))
    if not versions:
        versions[tracking_start] = previous_start_time
    versions[effective_from] = new_start_time
    rows = sorted(versions.items())[-MAX_SCHEDULE_HISTORY_VERSIONS:]
    return {
        **goals,
        SCHEDULE_TIME_HISTORY_KEY: [
            {"effective_from": version_date.isoformat(), "start_time": start.strftime("%H:%M")}
            for version_date, start in rows
        ],
    }


def apply_workout_schedule_settings(
    goals: dict[str, Any],
    *,
    days: set[int],
    start_time: time,
    effective_from: date,
    tracking_start: date,
) -> dict[str, Any]:
    """Write the canonical schedule and synchronized legacy mirrors."""

    previous_days = workout_days(goals)
    previous_settings = workout_schedule_settings(goals)
    normalized_days = sorted(day for day in days if 0 <= day <= 6)
    start_hhmm = start_time.strftime("%H:%M")
    schedule_changed = (
        normalized_days != previous_settings["days"]
        or start_hhmm != previous_settings["start_time"]
    )
    revision = int(previous_settings["revision"]) + (1 if schedule_changed else 0)
    stored_effective_from = (
        effective_from
        if schedule_changed
        else previous_settings.get("effective_from")
    )
    raw_notifications = goals.get("notification_settings")
    notifications = merge_notification_settings(
        raw_notifications if isinstance(raw_notifications, dict) else None,
    )
    workouts = dict(notifications.get("workouts") or {})
    workouts.update({"days": normalized_days, "time": start_hhmm})
    notifications["workouts"] = workouts

    changed = {
        **goals,
        SCHEDULE_SETTINGS_KEY: {
            "version": SCHEDULE_SETTINGS_VERSION,
            "revision": revision,
            "days": normalized_days,
            "start_time": start_hhmm,
            "effective_from": (
                stored_effective_from.isoformat()
                if isinstance(stored_effective_from, date)
                else None
            ),
        },
        # Compatibility for deployed clients and old profile readers.
        "notification_settings": notifications,
        "workout_days": normalized_days,
        "workout_start_time": start_hhmm,
    }
    changed = record_workout_schedule_change(
        changed,
        previous_days=previous_days,
        new_days=set(normalized_days),
        effective_from=effective_from,
        tracking_start=tracking_start,
    )
    return record_workout_schedule_time_change(
        changed,
        previous_start_time=parse_hhmm(str(previous_settings["start_time"])) or time(18, 30),
        new_start_time=start_time.replace(second=0, microsecond=0),
        effective_from=effective_from,
        tracking_start=tracking_start,
    )


def workout_start_time(goals: dict[str, Any]) -> time:
    configured = workout_schedule_settings(goals)["start_time"]
    return parse_hhmm(str(configured)) or time(18, 30)


def workout_lead_minutes(goals: dict[str, Any]) -> int:
    raw = _workout_settings(goals).get("remind_before_minutes", 0)
    try:
        return max(0, min(MAX_NOTIFICATION_LEAD_MINUTES, int(raw)))
    except (TypeError, ValueError):
        return 0


def _schedule_timezone(goals: dict[str, Any]):
    raw = goals.get("notification_settings")
    settings = merge_notification_settings(raw if isinstance(raw, dict) else None)
    return _resolve_tz(str(settings.get("timezone") or "Europe/Moscow"))


def local_schedule_day(goals: dict[str, Any], now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(_schedule_timezone(goals)).date()


def program_schedule_start(goals: dict[str, Any]) -> date | None:
    """Return the first calendar day that belongs to the active program."""
    raw = str(goals.get("active_program_started_at") or "").strip()[:10]
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


async def update_workout_schedule_settings(
    session: AsyncSession,
    user: User,
    *,
    days: set[int],
    start_time: time,
) -> dict[str, Any]:
    """Persist the domain schedule and its invisible analytics history."""

    goals = dict(user.goals or {})
    effective_from = local_schedule_day(goals)
    created_at = getattr(user, "created_at", None)
    tracking_start = program_schedule_start(goals) or (
        local_schedule_day(goals, created_at)
        if created_at is not None
        else effective_from
    )
    goals = apply_workout_schedule_settings(
        goals,
        days=days,
        start_time=start_time,
        effective_from=effective_from,
        tracking_start=tracking_start,
    )
    user.goals = goals
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)
    return workout_schedule_settings(goals)


def _schedule_overrides(goals: dict[str, Any]) -> list[dict[str, Any]]:
    raw = goals.get(OVERRIDES_KEY)
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            date.fromisoformat(str(item.get("original_date")))
            date.fromisoformat(str(item.get("target_date")))
            if parse_hhmm(str(item.get("target_time") or "")) is None:
                continue
        except ValueError:
            continue
        rows.append(dict(item))
    return rows


def _override_for_original(goals: dict[str, Any], original: date) -> dict[str, Any] | None:
    key = original.isoformat()
    return next((row for row in _schedule_overrides(goals) if row["original_date"] == key), None)


def _schedule_cancellations(goals: dict[str, Any]) -> list[dict[str, Any]]:
    raw = goals.get(CANCELLATIONS_KEY)
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            date.fromisoformat(str(item.get("scheduled_date")))
            source = item.get("source_date")
            if source:
                date.fromisoformat(str(source))
        except ValueError:
            continue
        rows.append(dict(item))
    return rows


def _cancellation_for_day(goals: dict[str, Any], day: date) -> dict[str, Any] | None:
    key = day.isoformat()
    active_program_id = str(goals.get("active_program_id") or "").strip()
    return next(
        (
            row
            for row in _schedule_cancellations(goals)
            if (not row.get("program_id") or str(row.get("program_id")) == active_program_id)
            and (row["scheduled_date"] == key or row.get("source_date") == key)
        ),
        None,
    )


def next_base_workout_date(goals: dict[str, Any], after: date) -> date | None:
    for offset in range(1, 8):
        candidate = after + timedelta(days=offset)
        if candidate.weekday() in workout_days_on(goals, candidate):
            return candidate
    return None


def effective_workout_context(goals: dict[str, Any], day: date) -> dict[str, Any]:
    """Resolve whether a local day is training after one-off overrides."""
    schedule_start = program_schedule_start(goals)
    if schedule_start is not None and day < schedule_start:
        return {
            "is_workout_day": False,
            "original_date": day,
            "target_date": day,
            "start_time": workout_start_time_on(goals, day),
            "override": None,
            "moved_away": False,
        }
    overrides = _schedule_overrides(goals)
    day_key = day.isoformat()
    target = next((row for row in overrides if row["target_date"] == day_key), None)
    if target is not None:
        return {
            "is_workout_day": True,
            "original_date": date.fromisoformat(str(target["original_date"])),
            "target_date": day,
            "start_time": parse_hhmm(str(target["target_time"])) or workout_start_time_on(goals, day),
            "override": target,
            "moved_away": False,
        }
    cancellation = _cancellation_for_day(goals, day)
    if cancellation is not None:
        return {
            "is_workout_day": False,
            "original_date": day,
            "target_date": day,
            "start_time": workout_start_time_on(goals, day),
            "override": cancellation,
            "moved_away": False,
            "cancelled": True,
        }
    source = next((row for row in overrides if row["original_date"] == day_key), None)
    if source is not None and source.get("target_date") != day_key:
        return {
            "is_workout_day": False,
            "original_date": day,
            "target_date": date.fromisoformat(str(source["target_date"])),
            "start_time": parse_hhmm(str(source["target_time"])) or workout_start_time_on(goals, day),
            "override": source,
            "moved_away": True,
        }
    return {
        "is_workout_day": day.weekday() in workout_days_on(goals, day),
        "original_date": day,
        "target_date": day,
        "start_time": workout_start_time_on(goals, day),
        "override": source,
        "moved_away": False,
    }


def _fallback_title(goals: dict[str, Any], override: dict[str, Any] | None = None) -> str:
    if override and str(override.get("title") or "").strip():
        return str(override["title"]).strip()
    try:
        day_index = int((override or {}).get("day_index") or goals.get("active_program_next_day") or 0)
    except (TypeError, ValueError):
        day_index = 0
    return f"День {day_index}" if day_index > 0 else "Тренировка"


async def active_program_snapshot(
    session: AsyncSession,
    user: User,
) -> tuple[uuid.UUID | None, int | None, str]:
    goals = user.goals or {}
    try:
        program_id = uuid.UUID(str(goals.get("active_program_id") or ""))
    except ValueError:
        return None, None, _fallback_title(goals)
    program = await session.scalar(
        select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
    )
    if program is None:
        return None, None, _fallback_title(goals)
    try:
        day_index = max(1, int(goals.get("active_program_next_day") or 1))
    except (TypeError, ValueError):
        day_index = 1
    structure = program.structure if isinstance(program.structure, dict) else {}
    schedule = structure.get("schedule") or structure.get("days") or []
    day: dict[str, Any] = {}
    if isinstance(schedule, list):
        for position, raw in enumerate(schedule, start=1):
            if not isinstance(raw, dict):
                continue
            try:
                item_index = int(raw.get("day_index", raw.get("day", position)))
            except (TypeError, ValueError):
                item_index = position
            if item_index == day_index:
                day = raw
                break
    day_title = str(day.get("name") or day.get("title") or f"День {day_index}").strip()
    return program.id, day_index, f"{program.name} · {day_title}"


def _occurrence_payload(
    goals: dict[str, Any],
    context: dict[str, Any],
    *,
    status_value: str,
) -> dict[str, Any]:
    override = context.get("override") if isinstance(context.get("override"), dict) else None
    original = context["original_date"]
    week_end = original + timedelta(days=6 - original.weekday())
    program_id = (override or {}).get("program_id") or goals.get("active_program_id")
    try:
        parsed_program_id = uuid.UUID(str(program_id)) if program_id else None
    except ValueError:
        parsed_program_id = None
    try:
        day_index = int((override or {}).get("day_index") or goals.get("active_program_next_day") or 0) or None
    except (TypeError, ValueError):
        day_index = None
    can_change = status_value in {"scheduled", "missed"}
    return {
        "original_date": original,
        "target_date": context["target_date"],
        "start_time": context["start_time"],
        "title": _fallback_title(goals, override),
        "program_id": parsed_program_id,
        "day_index": day_index,
        "status": status_value,
        "is_override": override is not None,
        "can_reschedule": can_change,
        "reschedule_until": week_end if can_change else None,
        "can_cancel": can_change,
        "cancel_to": next_base_workout_date(goals, original) if can_change else None,
    }


def workout_schedule_slots(
    goals: dict[str, Any],
    start: date,
    end: date,
) -> list[WorkoutScheduleSlot]:
    """Return base schedule slots with one-off moves and cancellations applied."""

    if end < start:
        return []
    schedule_start = program_schedule_start(goals)
    current = max(start, schedule_start) if schedule_start is not None else start
    slots: list[WorkoutScheduleSlot] = []
    while current <= end:
        if current.weekday() in workout_days_on(goals, current):
            cancellation = _cancellation_for_day(goals, current)
            override = _override_for_original(goals, current)
            if cancellation is not None:
                target = date.fromisoformat(str(cancellation["scheduled_date"]))
            elif override is not None:
                target = date.fromisoformat(str(override["target_date"]))
            else:
                target = current
            slots.append(
                WorkoutScheduleSlot(
                    original_date=current,
                    target_date=target,
                    is_rescheduled=target != current,
                    is_cancelled=cancellation is not None,
                )
            )
        current += timedelta(days=1)
    return slots


def schedule_overview(goals: dict[str, Any], requested_day: date) -> dict[str, Any]:
    current_context = effective_workout_context(goals, requested_day)
    current: dict[str, Any] | None = None
    if current_context["is_workout_day"]:
        current = _occurrence_payload(goals, current_context, status_value="scheduled")
    elif current_context.get("cancelled"):
        current = _occurrence_payload(goals, current_context, status_value="cancelled")
    elif current_context["moved_away"]:
        current = _occurrence_payload(goals, current_context, status_value="moved")

    upcoming: dict[str, Any] | None = None
    for offset in range(0, 15):
        candidate = requested_day + timedelta(days=offset)
        context = effective_workout_context(goals, candidate)
        if context["is_workout_day"]:
            upcoming = _occurrence_payload(goals, context, status_value="scheduled")
            break
    return {"requested_date": requested_day, "current": current, "next": upcoming}


async def get_schedule_overview(
    session: AsyncSession,
    user: User,
    requested_day: date,
) -> dict[str, Any]:
    goals = user.goals or {}
    overview = schedule_overview(goals, requested_day)
    current = overview.get("current")
    if isinstance(current, dict) and current.get("status") == "scheduled":
        completed_filters = [
            Workout.user_id == user.id,
            Workout.scheduled_date == current["target_date"],
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        ]
        if current.get("program_id") is not None:
            completed_filters.append(Workout.program_id == current["program_id"])
        completed = await session.scalar(
            select(Workout)
            .where(*completed_filters)
            .order_by(Workout.completed_at.desc(), Workout.created_at.desc())
        )
        if completed is not None:
            plan = completed.plan if isinstance(completed.plan, dict) else {}
            current["status"] = "completed"
            current["program_id"] = completed.program_id or current.get("program_id")
            current["title"] = str(
                completed.title or plan.get("title") or current.get("title") or "Тренировка"
            )
            try:
                current["day_index"] = int(
                    plan.get("day_index") or current.get("day_index") or 0
                ) or None
            except (TypeError, ValueError):
                current["day_index"] = current.get("day_index")
            current["can_reschedule"] = False
            current["reschedule_until"] = None
            current["can_cancel"] = False
            current["cancel_to"] = None

            # Today appears as both current and next in the pure schedule. Once
            # completed, expose the first future occurrence for preparation.
            future = schedule_overview(goals, requested_day + timedelta(days=1))
            overview["next"] = future.get("next")
    if overview.get("current") is None:
        schedule_start = program_schedule_start(goals)
        created_at = getattr(user, "created_at", None)
        if schedule_start is None and created_at is not None:
            schedule_start = created_at.astimezone(_schedule_timezone(goals)).date()
        for offset in range(1, MAX_RESCHEDULE_LOOKBACK_DAYS + 1):
            original = requested_day - timedelta(days=offset)
            if schedule_start is not None and original < schedule_start:
                break
            if original.weekday() not in workout_days_on(goals, original):
                continue
            next_base = next_base_workout_date(goals, original)
            if next_base is None or requested_day >= next_base:
                continue
            if _override_for_original(goals, original) is not None:
                continue
            if _cancellation_for_day(goals, original) is not None:
                continue
            performed = await session.scalar(
                select(Workout.id).where(
                    Workout.user_id == user.id,
                    Workout.scheduled_date >= original,
                    Workout.scheduled_date <= requested_day,
                    Workout.status.in_(["planned", "completed"]),
                    Workout.is_deleted.is_(False),
                )
            )
            if performed is None:
                context = effective_workout_context(goals, original)
                overview["current"] = _occurrence_payload(
                    goals,
                    context,
                    status_value="missed",
                )
            break
    program_id, day_index, title = await active_program_snapshot(session, user)
    for key in ("current", "next"):
        occurrence = overview.get(key)
        if not isinstance(occurrence, dict):
            continue
        if occurrence["title"].startswith("День ") or occurrence["title"] == "Тренировка":
            occurrence["title"] = title
        occurrence["program_id"] = occurrence.get("program_id") or program_id
        occurrence["day_index"] = occurrence.get("day_index") or day_index
    return overview


async def latest_completed_workout_date(
    session: AsyncSession,
    user: User,
) -> date | None:
    """Return the latest real completion date in the user's schedule timezone."""

    latest_completed_at = await session.scalar(
        select(func.max(Workout.completed_at)).where(
            Workout.user_id == user.id,
            Workout.status == "completed",
            Workout.completed_at.is_not(None),
            Workout.is_deleted.is_(False),
        )
    )
    if not isinstance(latest_completed_at, datetime):
        return None
    if latest_completed_at.tzinfo is None:
        latest_completed_at = latest_completed_at.replace(tzinfo=UTC)
    return latest_completed_at.astimezone(_schedule_timezone(user.goals or {})).date()


async def cancel_workout_occurrence(
    session: AsyncSession,
    user: User,
    *,
    scheduled_date: date,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Cancel one occurrence; the unchanged cursor makes it next in program order."""
    locked_user = await session.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    goals = dict(locked_user.goals or {})
    local_now = (now or datetime.now(UTC)).astimezone(_schedule_timezone(goals))
    if scheduled_date < local_now.date() - timedelta(days=MAX_RESCHEDULE_LOOKBACK_DAYS):
        raise HTTPException(status_code=400, detail="Эту тренировку уже нельзя отменить")

    existing_cancellation = _cancellation_for_day(goals, scheduled_date)
    if existing_cancellation is not None:
        return await get_schedule_overview(session, locked_user, local_now.date())
    context = effective_workout_context(goals, scheduled_date)
    if not context["is_workout_day"]:
        raise HTTPException(status_code=400, detail="На выбранную дату тренировка не запланирована")
    next_date = next_base_workout_date(goals, scheduled_date)
    if next_date is None:
        raise HTTPException(status_code=400, detail="Не найден следующий тренировочный день")

    completed = await session.scalar(
        select(Workout.id).where(
            Workout.user_id == locked_user.id,
            Workout.scheduled_date == scheduled_date,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
    )
    if completed is not None:
        raise HTTPException(status_code=409, detail="Выполненную тренировку отменить нельзя")

    context_override = context.get("override") if isinstance(context.get("override"), dict) else {}
    program_id, day_index, title = await active_program_snapshot(session, locked_user)
    source_date = context["original_date"]
    cancellations = [
        row
        for row in _schedule_cancellations(goals)
        if row["scheduled_date"] != scheduled_date.isoformat()
    ]
    cancellations.append(
        {
            "scheduled_date": scheduled_date.isoformat(),
            "source_date": source_date.isoformat() if source_date != scheduled_date else None,
            "program_id": str(context_override.get("program_id") or program_id or "") or None,
            "day_index": context_override.get("day_index") or day_index,
            "title": str(context_override.get("title") or title),
            "next_date": next_date.isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    )
    cutoff = local_now.date() - timedelta(days=SCHEDULE_HISTORY_RETENTION_DAYS)
    goals[CANCELLATIONS_KEY] = [
        row
        for row in cancellations
        if date.fromisoformat(str(row["scheduled_date"])) >= cutoff
    ]
    goals[OVERRIDES_KEY] = [
        row
        for row in _schedule_overrides(goals)
        if row["original_date"] != source_date.isoformat()
        and row["target_date"] != scheduled_date.isoformat()
    ]
    locked_user.goals = goals
    flag_modified(locked_user, "goals")

    plan_override_filters = [
        WorkoutPlanOverride.user_id == locked_user.id,
        WorkoutPlanOverride.scheduled_date == scheduled_date,
        WorkoutPlanOverride.is_deleted.is_(False),
    ]
    if program_id is not None:
        plan_override_filters.append(WorkoutPlanOverride.program_id == program_id)
    await session.execute(
        update(WorkoutPlanOverride)
        .where(*plan_override_filters)
        .values(scheduled_date=next_date)
    )
    await session.commit()
    await session.refresh(locked_user)
    user.goals = locked_user.goals

    from app.services import supplement_intakes

    await supplement_intakes.reset_pending_days(
        session,
        locked_user,
        {scheduled_date, next_date},
    )
    return await get_schedule_overview(session, locked_user, local_now.date())
