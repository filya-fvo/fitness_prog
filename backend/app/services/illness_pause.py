"""User-controlled training pause during illness and recovery-week state."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User

PERIODS_KEY = "workout_illness_periods"
RECOVERY_KEY = "workout_illness_recovery"
MAX_PERIODS = 24


def _date(raw: object) -> date | None:
    try:
        return date.fromisoformat(str(raw)[:10])
    except (TypeError, ValueError):
        return None


def illness_periods(goals: dict[str, Any]) -> list[dict[str, str | None]]:
    rows = goals.get(PERIODS_KEY)
    if not isinstance(rows, list):
        return []
    parsed: list[dict[str, str | None]] = []
    for row in rows[-MAX_PERIODS:]:
        if not isinstance(row, dict):
            continue
        started = _date(row.get("started_on"))
        ended = _date(row.get("ended_on"))
        if started is None or (ended is not None and ended < started):
            continue
        parsed.append({
            "started_on": started.isoformat(),
            "ended_on": ended.isoformat() if ended else None,
        })
    return parsed


def is_illness_day(goals: dict[str, Any], day: date) -> bool:
    for period in illness_periods(goals):
        started = date.fromisoformat(str(period["started_on"]))
        ended = _date(period.get("ended_on"))
        if day >= started and (ended is None or day <= ended):
            return True
    return False


def recovery_light_week_active(goals: dict[str, Any]) -> bool:
    state = goals.get(RECOVERY_KEY)
    return bool(isinstance(state, dict) and state.get("light_cycle_active"))


def illness_status(goals: dict[str, Any]) -> dict[str, object]:
    periods = illness_periods(goals)
    active = next((row for row in reversed(periods) if row["ended_on"] is None), None)
    recovery = goals.get(RECOVERY_KEY)
    recovery = recovery if isinstance(recovery, dict) else {}
    return {
        "active": active is not None,
        "started_on": active["started_on"] if active else None,
        "recovery_choice_pending": bool(recovery.get("choice_pending")),
        "recovery_light_week_active": bool(recovery.get("light_cycle_active")),
    }


async def _locked_user(session: AsyncSession, user: User) -> User:
    locked = await session.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return locked


async def _save(session: AsyncSession, user: User, locked: User, goals: dict[str, Any]) -> dict[str, object]:
    locked.goals = goals
    flag_modified(locked, "goals")
    await session.commit()
    await session.refresh(locked)
    user.goals = locked.goals
    return illness_status(goals)


async def start_illness_pause(
    session: AsyncSession,
    user: User,
    *,
    local_day: date,
) -> dict[str, object]:
    locked = await _locked_user(session, user)
    goals = dict(locked.goals or {})
    periods = illness_periods(goals)
    if any(row["ended_on"] is None for row in periods):
        return illness_status(goals)
    periods.append({"started_on": local_day.isoformat(), "ended_on": None})
    goals[PERIODS_KEY] = periods[-MAX_PERIODS:]
    goals[RECOVERY_KEY] = {"choice_pending": False, "light_cycle_active": False}
    return await _save(session, user, locked, goals)


async def end_illness_pause(
    session: AsyncSession,
    user: User,
    *,
    local_day: date,
) -> dict[str, object]:
    locked = await _locked_user(session, user)
    goals = dict(locked.goals or {})
    periods = illness_periods(goals)
    active_index = next(
        (index for index in range(len(periods) - 1, -1, -1) if periods[index]["ended_on"] is None),
        None,
    )
    if active_index is None:
        return illness_status(goals)
    started = date.fromisoformat(str(periods[active_index]["started_on"]))
    last_illness_day = local_day - timedelta(days=1)
    if last_illness_day < started:
        periods.pop(active_index)
    else:
        periods[active_index]["ended_on"] = last_illness_day.isoformat()
    goals[PERIODS_KEY] = periods
    goals[RECOVERY_KEY] = {"choice_pending": True, "light_cycle_active": False}
    return await _save(session, user, locked, goals)


async def choose_recovery(
    session: AsyncSession,
    user: User,
    *,
    choice: Literal["light_week", "normal"],
) -> dict[str, object]:
    locked = await _locked_user(session, user)
    goals = dict(locked.goals or {})
    light = choice == "light_week"
    goals[RECOVERY_KEY] = {"choice_pending": False, "light_cycle_active": light}
    if light:
        goals["active_program_week_phase"] = "light"
        goals["active_program_phase_source"] = "manual"
        goals["active_program_workouts_in_phase"] = 0
    return await _save(session, user, locked, goals)


def finish_recovery_cycle(goals: dict[str, Any]) -> dict[str, Any]:
    if not recovery_light_week_active(goals):
        return goals
    updated = dict(goals)
    updated[RECOVERY_KEY] = {"choice_pending": False, "light_cycle_active": False}
    return updated
