"""Recurring workout schedule and one-off occurrence rescheduling."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout
from app.services.notification_prefs import _resolve_tz, merge_notification_settings, parse_hhmm

OVERRIDES_KEY = "workout_schedule_overrides"
MAX_RESCHEDULE_LOOKBACK_DAYS = 6
MAX_NOTIFICATION_LEAD_MINUTES = 24 * 60


def _workout_settings(goals: dict[str, Any]) -> dict[str, Any]:
    raw = goals.get("notification_settings")
    settings = merge_notification_settings(raw if isinstance(raw, dict) else None)
    value = settings.get("workouts")
    return dict(value) if isinstance(value, dict) else {}


def workout_days(goals: dict[str, Any]) -> set[int]:
    raw = _workout_settings(goals).get("days") or []
    days: set[int] = set()
    for value in raw if isinstance(raw, list) else []:
        try:
            weekday = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= weekday <= 6:
            days.add(weekday)
    return days


def workout_start_time(goals: dict[str, Any]) -> time:
    configured = _workout_settings(goals).get("time") or "18:30"
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


def next_base_workout_date(goals: dict[str, Any], after: date) -> date | None:
    days = workout_days(goals)
    for offset in range(1, 8):
        candidate = after + timedelta(days=offset)
        if candidate.weekday() in days:
            return candidate
    return None


def effective_workout_context(goals: dict[str, Any], day: date) -> dict[str, Any]:
    """Resolve whether a local day is training after one-off overrides."""
    overrides = _schedule_overrides(goals)
    day_key = day.isoformat()
    target = next((row for row in overrides if row["target_date"] == day_key), None)
    if target is not None:
        return {
            "is_workout_day": True,
            "original_date": date.fromisoformat(str(target["original_date"])),
            "target_date": day,
            "start_time": parse_hhmm(str(target["target_time"])) or workout_start_time(goals),
            "override": target,
            "moved_away": False,
        }
    source = next((row for row in overrides if row["original_date"] == day_key), None)
    if source is not None and source.get("target_date") != day_key:
        return {
            "is_workout_day": False,
            "original_date": day,
            "target_date": date.fromisoformat(str(source["target_date"])),
            "start_time": parse_hhmm(str(source["target_time"])) or workout_start_time(goals),
            "override": source,
            "moved_away": True,
        }
    return {
        "is_workout_day": day.weekday() in workout_days(goals),
        "original_date": day,
        "target_date": day,
        "start_time": workout_start_time(goals),
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
    next_base = next_base_workout_date(goals, original)
    program_id = (override or {}).get("program_id") or goals.get("active_program_id")
    try:
        parsed_program_id = uuid.UUID(str(program_id)) if program_id else None
    except ValueError:
        parsed_program_id = None
    try:
        day_index = int((override or {}).get("day_index") or goals.get("active_program_next_day") or 0) or None
    except (TypeError, ValueError):
        day_index = None
    return {
        "original_date": original,
        "target_date": context["target_date"],
        "start_time": context["start_time"],
        "title": _fallback_title(goals, override),
        "program_id": parsed_program_id,
        "day_index": day_index,
        "status": status_value,
        "is_override": override is not None,
        "can_reschedule": next_base is not None,
        "reschedule_until": next_base - timedelta(days=1) if next_base else None,
    }


def schedule_overview(goals: dict[str, Any], requested_day: date) -> dict[str, Any]:
    current_context = effective_workout_context(goals, requested_day)
    current: dict[str, Any] | None = None
    if current_context["is_workout_day"]:
        current = _occurrence_payload(goals, current_context, status_value="scheduled")
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
    overview = schedule_overview(user.goals or {}, requested_day)
    if overview.get("current") is None:
        goals = user.goals or {}
        for offset in range(1, MAX_RESCHEDULE_LOOKBACK_DAYS + 1):
            original = requested_day - timedelta(days=offset)
            if original.weekday() not in workout_days(goals):
                continue
            next_base = next_base_workout_date(goals, original)
            if next_base is None or requested_day >= next_base:
                continue
            if _override_for_original(goals, original) is not None:
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


async def reschedule_workout_occurrence(
    session: AsyncSession,
    user: User,
    *,
    original_date: date,
    target_date: date,
    target_time: time,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Move one occurrence inside its gap before the next base workout."""
    locked_user = await session.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    goals = dict(locked_user.goals or {})
    if original_date.weekday() not in workout_days(goals):
        raise HTTPException(status_code=400, detail="Исходная дата не входит в расписание тренировок")
    local_now = (now or datetime.now(UTC)).astimezone(_schedule_timezone(goals))
    if original_date < local_now.date() - timedelta(days=MAX_RESCHEDULE_LOOKBACK_DAYS):
        raise HTTPException(status_code=400, detail="Эту тренировку уже нельзя перенести")
    if target_date < local_now.date() or target_date < original_date:
        raise HTTPException(status_code=400, detail="Выберите текущую или будущую дату")
    next_base = next_base_workout_date(goals, original_date)
    if next_base is None or target_date >= next_base:
        limit = (next_base - timedelta(days=1)).strftime("%d.%m") if next_base else "следующей тренировки"
        raise HTTPException(status_code=400, detail=f"Перенести можно не позднее {limit}")

    normalized_time = target_time.replace(second=0, microsecond=0)
    base_time = workout_start_time(goals)
    if target_date == original_date and normalized_time < base_time:
        raise HTTPException(
            status_code=400,
            detail="В этот день тренировку можно перенести только на более позднее время",
        )
    target_at = datetime.combine(target_date, normalized_time, tzinfo=_schedule_timezone(goals))
    if target_at <= local_now:
        raise HTTPException(status_code=400, detail="Выберите время, которое ещё не прошло")

    overrides = _schedule_overrides(goals)
    for row in overrides:
        if row["original_date"] != original_date.isoformat() and row["target_date"] == target_date.isoformat():
            raise HTTPException(status_code=409, detail="На эту дату уже перенесена другая тренировка")

    # Returning to the regular date and time removes the exception.
    is_default_slot = target_date == original_date and normalized_time == base_time
    overrides = [row for row in overrides if row["original_date"] != original_date.isoformat()]
    if not is_default_slot:
        program_id, day_index, title = await active_program_snapshot(session, locked_user)
        overrides.append(
            {
                "original_date": original_date.isoformat(),
                "target_date": target_date.isoformat(),
                "target_time": normalized_time.strftime("%H:%M"),
                "program_id": str(program_id) if program_id else None,
                "day_index": day_index,
                "title": title,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )
    cutoff = local_now.date() - timedelta(days=14)
    goals[OVERRIDES_KEY] = [
        row for row in overrides if date.fromisoformat(str(row["target_date"])) >= cutoff
    ]
    locked_user.goals = goals
    flag_modified(locked_user, "goals")
    await session.commit()
    await session.refresh(locked_user)
    user.goals = locked_user.goals

    # Pending workout/rest-day supplement rows follow the effective occurrence.
    from app.services import supplement_intakes

    await supplement_intakes.reset_pending_days(
        session,
        locked_user,
        {original_date, target_date},
    )
    return await get_schedule_overview(session, locked_user, local_now.date())
