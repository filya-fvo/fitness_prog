"""Transparent regularity scoring shared by private and global competitions."""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Competition, CompetitionParticipant
from app.models.workout import Workout
from app.services.notification_prefs import _resolve_tz


@dataclass(slots=True)
class RegularityScore:
    score: float | None
    completed: int
    planned: int


class RegularityParticipant(Protocol):
    user_id: uuid.UUID
    schedule_days: list[int]
    timezone: str


def _valid_days(values: object) -> set[int]:
    if not isinstance(values, list):
        return set()
    result: set[int] = set()
    for value in values:
        try:
            weekday = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= weekday <= 6:
            result.add(weekday)
    return result


def _planned_dates(start: date, end: date, weekdays: set[int]) -> list[date]:
    result: list[date] = []
    current = start
    while current <= end:
        if current.weekday() in weekdays:
            result.append(current)
        current += timedelta(days=1)
    return result


def participant_local_day(
    participant: RegularityParticipant,
    now: datetime | None = None,
) -> date:
    current = now or datetime.now(UTC)
    return current.astimezone(_resolve_tz(participant.timezone)).date()


def calculate_regularity_score(
    *,
    start_date: date,
    end_date: date,
    schedule_days: object,
    local_day: date,
    completed_dates: Iterable[date],
) -> RegularityScore:
    """Calculate capped adherence from immutable completion facts and a frozen schedule."""
    completed_set = set(completed_dates)
    planned_dates = _planned_dates(start_date, end_date, _valid_days(schedule_days))
    eligible = [day for day in planned_dates if day < local_day]
    if local_day in planned_dates and local_day in completed_set:
        eligible.append(local_day)
    if local_day > end_date:
        eligible = planned_dates
    planned = len(eligible)
    completed = len(completed_set.intersection(eligible))
    score = round(min(100, 100 * completed / planned), 1) if planned else None
    return RegularityScore(score, completed, planned)


async def regularity_scores_for_period(
    session: AsyncSession,
    *,
    start_date: date,
    end_date: date,
    participants: Sequence[RegularityParticipant],
    now: datetime | None = None,
) -> dict[uuid.UUID, RegularityScore]:
    """Calculate many participant scores using one workout query."""
    if not participants:
        return {}
    user_ids = [participant.user_id for participant in participants]
    rows = await session.execute(
        select(Workout.user_id, Workout.scheduled_date)
        .distinct()
        .where(
            Workout.user_id.in_(user_ids),
            Workout.scheduled_date >= start_date,
            Workout.scheduled_date <= end_date,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
    )
    completed_by_user: dict[uuid.UUID, set[date]] = {user_id: set() for user_id in user_ids}
    for user_id, scheduled_date in rows.all():
        completed_by_user.setdefault(user_id, set()).add(scheduled_date)
    current = now or datetime.now(UTC)
    return {
        participant.user_id: calculate_regularity_score(
            start_date=start_date,
            end_date=end_date,
            schedule_days=participant.schedule_days,
            local_day=participant_local_day(participant, current),
            completed_dates=completed_by_user.get(participant.user_id, set()),
        )
        for participant in participants
    }


async def regularity_score(
    session: AsyncSession,
    competition: Competition,
    participant: CompetitionParticipant,
    *,
    now: datetime | None = None,
) -> RegularityScore:
    if competition.start_date is None or competition.end_date is None:
        return RegularityScore(None, 0, 0)
    scores = await regularity_scores_for_period(
        session,
        start_date=competition.start_date,
        end_date=competition.end_date,
        participants=[participant],
        now=now,
    )
    return scores[participant.user_id]
