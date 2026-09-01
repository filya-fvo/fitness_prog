"""Transparent regularity scoring for private competitions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Competition, CompetitionParticipant
from app.models.workout import Workout
from app.services.notification_prefs import _resolve_tz


@dataclass(slots=True)
class RegularityScore:
    score: float | None
    completed: int
    planned: int


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
    participant: CompetitionParticipant,
    now: datetime | None = None,
) -> date:
    current = now or datetime.now(UTC)
    return current.astimezone(_resolve_tz(participant.timezone)).date()


async def regularity_score(
    session: AsyncSession,
    competition: Competition,
    participant: CompetitionParticipant,
    *,
    now: datetime | None = None,
) -> RegularityScore:
    if competition.start_date is None or competition.end_date is None:
        return RegularityScore(None, 0, 0)
    local_day = participant_local_day(participant, now)
    completed_through = min(local_day, competition.end_date)
    rows = await session.scalars(
        select(distinct(Workout.scheduled_date)).where(
            Workout.user_id == participant.user_id,
            Workout.scheduled_date >= competition.start_date,
            Workout.scheduled_date <= completed_through,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
        )
    )
    completed_dates = set(rows.all())
    planned_dates = _planned_dates(
        competition.start_date,
        competition.end_date,
        _valid_days(participant.schedule_days),
    )
    eligible = [day for day in planned_dates if day < local_day]
    if local_day in planned_dates and local_day in completed_dates:
        eligible.append(local_day)
    if local_day > competition.end_date:
        eligible = planned_dates
    planned = len(eligible)
    completed = len(completed_dates.intersection(eligible))
    score = round(100 * completed / planned, 1) if planned else None
    return RegularityScore(score, completed, planned)
