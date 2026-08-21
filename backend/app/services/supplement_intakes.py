"""Idempotent supplement schedule materialization and status updates."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplement_intake import SupplementIntake
from app.models.user import User
from app.services.notification_prefs import (
    _resolve_slot_time,
    _resolve_tz,
    merge_notification_settings,
    normalize_supplement_schedule,
)
from app.services.scheduler import effective_workout_context

VALID_STATUSES = {"pending", "taken", "skipped"}
VALID_SOURCES = {"telegram", "web", "app"}


def local_day_for_user(user: User, now: datetime | None = None) -> date:
    """Return the user's calendar day using their notification timezone."""
    settings = merge_notification_settings(
        (user.goals or {}).get("notification_settings")
        if isinstance((user.goals or {}).get("notification_settings"), dict)
        else None
    )
    timezone_name = str(settings.get("timezone") or "Europe/Moscow")
    return (now or datetime.now(UTC)).astimezone(_resolve_tz(timezone_name)).date()


def _day_bounds(day: date, timezone_name: str) -> tuple[datetime, datetime]:
    tz = _resolve_tz(timezone_name)
    start = datetime.combine(day, time.min, tzinfo=tz).astimezone(UTC)
    return start, start + timedelta(days=1)


def _scheduled_rows(user: User, day: date) -> list[dict[str, Any]]:
    goals = user.goals or {}
    settings = merge_notification_settings(
        goals.get("notification_settings")
        if isinstance(goals.get("notification_settings"), dict)
        else None
    )
    tz = _resolve_tz(str(settings.get("timezone") or "Europe/Moscow"))
    workout_context = effective_workout_context(goals, day)
    workout_t = workout_context["start_time"]
    workout_day = bool(workout_context["is_workout_day"])
    rows: list[dict[str, Any]] = []
    supplements = goals.get("supplements")
    if not isinstance(supplements, list):
        return rows
    for item in supplements:
        if not isinstance(item, dict) or not item.get("enabled", True):
            continue
        entry_id = str(item.get("id") or item.get("key") or item.get("name_ru") or "supplement")
        for schedule in normalize_supplement_schedule(item):
            mode = schedule.get("days") or "every"
            if mode == "workout" and not workout_day:
                continue
            if mode == "rest" and workout_day:
                continue
            slot = schedule["slot"]
            target = _resolve_slot_time(slot, workout_t)
            if target is None:
                continue
            rows.append(
                {
                    "user_id": user.id,
                    "supplement_entry_id": entry_id,
                    "supplement_key": str(item.get("key") or entry_id),
                    "name_ru": str(item.get("name_ru") or item.get("key") or "Добавка"),
                    "dose": str(item.get("dose") or ""),
                    "slot": slot,
                    "days_mode": mode,
                    "scheduled_at": datetime.combine(day, target, tzinfo=tz).astimezone(UTC),
                }
            )
    return rows


async def ensure_day(session: AsyncSession, user: User, day: date) -> None:
    rows = _scheduled_rows(user, day)
    if not rows:
        return
    statement = insert(SupplementIntake).values(rows)
    statement = statement.on_conflict_do_nothing(
        constraint="uq_supplement_intake_slot"
    )
    await session.execute(statement)
    await session.commit()


async def reset_pending_schedule(session: AsyncSession, user: User) -> None:
    """Rebuild pending items after the user changes their supplement stack."""
    settings = merge_notification_settings(
        (user.goals or {}).get("notification_settings")
        if isinstance((user.goals or {}).get("notification_settings"), dict)
        else None
    )
    day = local_day_for_user(user)
    start, _ = _day_bounds(day, str(settings.get("timezone") or "Europe/Moscow"))
    await session.execute(
        delete(SupplementIntake).where(
            SupplementIntake.user_id == user.id,
            SupplementIntake.status == "pending",
            SupplementIntake.scheduled_at >= start,
        )
    )
    await session.commit()


async def reset_pending_days(
    session: AsyncSession,
    user: User,
    days: set[date],
) -> None:
    """Rebuild only pending rows affected by a workout occurrence move."""
    settings = merge_notification_settings(
        (user.goals or {}).get("notification_settings")
        if isinstance((user.goals or {}).get("notification_settings"), dict)
        else None
    )
    timezone_name = str(settings.get("timezone") or "Europe/Moscow")
    for day in days:
        start, end = _day_bounds(day, timezone_name)
        await session.execute(
            delete(SupplementIntake).where(
                SupplementIntake.user_id == user.id,
                SupplementIntake.status == "pending",
                SupplementIntake.scheduled_at >= start,
                SupplementIntake.scheduled_at < end,
            )
        )
    await session.commit()


async def day_items(
    session: AsyncSession,
    user: User,
    day: date,
) -> tuple[str, list[SupplementIntake]]:
    settings = merge_notification_settings(
        (user.goals or {}).get("notification_settings")
        if isinstance((user.goals or {}).get("notification_settings"), dict)
        else None
    )
    timezone_name = str(settings.get("timezone") or "Europe/Moscow")
    await ensure_day(session, user, day)
    start, end = _day_bounds(day, timezone_name)
    items = list(
        await session.scalars(
            select(SupplementIntake)
            .where(
                SupplementIntake.user_id == user.id,
                SupplementIntake.scheduled_at >= start,
                SupplementIntake.scheduled_at < end,
                SupplementIntake.is_deleted.is_(False),
            )
            .order_by(SupplementIntake.scheduled_at, SupplementIntake.name_ru)
        )
    )
    return timezone_name, items


async def mark_intake(
    session: AsyncSession,
    user: User,
    intake_id: uuid.UUID,
    *,
    status: str,
    source: str,
) -> SupplementIntake | None:
    if status not in VALID_STATUSES or source not in VALID_SOURCES:
        raise ValueError("invalid supplement intake status or source")
    intake = await session.scalar(
        select(SupplementIntake)
        .where(
            SupplementIntake.id == intake_id,
            SupplementIntake.user_id == user.id,
            SupplementIntake.is_deleted.is_(False),
        )
        .with_for_update()
    )
    if intake is None:
        return None
    if intake.status == status:
        return intake
    intake.status = status
    intake.source = source
    intake.completed_at = datetime.now(UTC) if status in {"taken", "skipped"} else None
    await session.commit()
    await session.refresh(intake)
    return intake


async def mark_group(
    session: AsyncSession,
    user: User,
    anchor_id: uuid.UUID,
    *,
    status: str,
    source: str,
) -> list[SupplementIntake]:
    if status not in VALID_STATUSES or source not in VALID_SOURCES:
        raise ValueError("invalid supplement intake status or source")
    anchor = await session.scalar(
        select(SupplementIntake).where(
            SupplementIntake.id == anchor_id,
            SupplementIntake.user_id == user.id,
            SupplementIntake.is_deleted.is_(False),
        )
    )
    if anchor is None:
        return []
    rows = list(
        await session.scalars(
            select(SupplementIntake)
            .where(
                SupplementIntake.user_id == user.id,
                SupplementIntake.scheduled_at == anchor.scheduled_at,
                SupplementIntake.is_deleted.is_(False),
            )
            .order_by(SupplementIntake.id)
            .with_for_update()
        )
    )
    now = datetime.now(UTC)
    for row in rows:
        row.status = status
        row.source = source
        row.completed_at = now if status in {"taken", "skipped"} else None
    await session.commit()
    return rows


async def intake_group(
    session: AsyncSession,
    user: User,
    anchor_id: uuid.UUID,
) -> list[SupplementIntake]:
    anchor = await session.scalar(
        select(SupplementIntake).where(
            SupplementIntake.id == anchor_id,
            SupplementIntake.user_id == user.id,
            SupplementIntake.is_deleted.is_(False),
        )
    )
    if anchor is None:
        return []
    return list(
        await session.scalars(
            select(SupplementIntake)
            .where(
                SupplementIntake.user_id == user.id,
                SupplementIntake.scheduled_at == anchor.scheduled_at,
                SupplementIntake.is_deleted.is_(False),
            )
            .order_by(SupplementIntake.name_ru)
        )
    )


async def snooze_intake(
    session: AsyncSession,
    user: User,
    intake_id: uuid.UUID,
    *,
    minutes: int = 30,
) -> SupplementIntake | None:
    intake = await session.scalar(
        select(SupplementIntake)
        .where(
            SupplementIntake.id == intake_id,
            SupplementIntake.user_id == user.id,
            SupplementIntake.is_deleted.is_(False),
        )
        .with_for_update()
    )
    if intake is None:
        return None
    if intake.status != "pending":
        return intake
    intake.snoozed_until = datetime.now(UTC) + timedelta(minutes=max(5, min(minutes, 180)))
    intake.notified_at = None
    await session.commit()
    await session.refresh(intake)
    return intake


async def snooze_group(
    session: AsyncSession,
    user: User,
    anchor_id: uuid.UUID,
    *,
    minutes: int = 30,
) -> list[SupplementIntake]:
    rows = await intake_group(session, user, anchor_id)
    until = datetime.now(UTC) + timedelta(minutes=max(5, min(minutes, 180)))
    for row in rows:
        if row.status == "pending":
            row.snoozed_until = until
            row.notified_at = None
    await session.commit()
    return rows


async def due_groups(
    session: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> list[list[SupplementIntake]]:
    now = now or datetime.now(UTC)
    settings = merge_notification_settings(
        (user.goals or {}).get("notification_settings")
        if isinstance((user.goals or {}).get("notification_settings"), dict)
        else None
    )
    if not bool((settings.get("supplements") or {}).get("enabled", True)):
        return []
    local_day = local_day_for_user(user, now)
    await ensure_day(session, user, local_day)
    effective = func.coalesce(SupplementIntake.snoozed_until, SupplementIntake.scheduled_at)
    day_start, _ = _day_bounds(local_day, str(settings.get("timezone") or "Europe/Moscow"))
    lower_bound = day_start if bool(settings.get("catch_up", True)) else now - timedelta(minutes=5)
    rows = list(
        await session.scalars(
            select(SupplementIntake)
            .where(
                SupplementIntake.user_id == user.id,
                SupplementIntake.status == "pending",
                SupplementIntake.notified_at.is_(None),
                effective >= lower_bound,
                effective <= now,
                SupplementIntake.is_deleted.is_(False),
            )
            .order_by(effective, SupplementIntake.name_ru)
            .with_for_update(skip_locked=True)
        )
    )
    grouped: dict[datetime, list[SupplementIntake]] = {}
    for row in rows:
        key = row.snoozed_until or row.scheduled_at
        grouped.setdefault(key, []).append(row)
    return list(grouped.values())


async def claim_notified(session: AsyncSession, rows: list[SupplementIntake]) -> None:
    now = datetime.now(UTC)
    for row in rows:
        row.notified_at = now
    await session.commit()


async def release_notification_claim(session: AsyncSession, rows: list[SupplementIntake]) -> None:
    for row in rows:
        row.notified_at = None
    await session.commit()
