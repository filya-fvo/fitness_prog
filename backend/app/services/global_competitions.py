"""Opt-in global regularity seasons with cohort privacy and anti-gaming snapshots."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_competition import GlobalCompetitionParticipant, GlobalCompetitionSeason
from app.models.user import User
from app.services.competition_scoring import RegularityScore, regularity_scores_for_period
from app.services.notification_prefs import merge_notification_settings
from app.services.scheduler import workout_days

SEASON_DAYS = 28
JOIN_WINDOW_DAYS = 7
MIN_PUBLIC_COHORT = 20
MIN_RANKED_PLANNED = 2
ALGORITHM_VERSION = "regularity_global_v1"
SEASON_ANCHOR = date(2026, 8, 31)
GLOBAL_TIMEZONE = ZoneInfo("Europe/Moscow")
COHORT_LABELS = {
    "days_1_2": "1–2 тренировки в неделю",
    "days_3": "3 тренировки в неделю",
    "days_4_plus": "4+ тренировки в неделю",
}


class GlobalCompetitionError(RuntimeError):
    pass


class GlobalScheduleError(GlobalCompetitionError):
    pass


class GlobalRejoinError(GlobalCompetitionError):
    pass


@dataclass(frozen=True, slots=True)
class SeasonWindow:
    season_key: str
    title: str
    start_date: date
    end_date: date
    join_deadline: date


@dataclass(frozen=True, slots=True)
class RankedParticipant:
    participant: GlobalCompetitionParticipant
    score: RegularityScore
    rank: int


@dataclass(slots=True)
class GlobalSeasonView:
    window: SeasonWindow
    status: str
    algorithm_version: str
    cohort: str
    participants: int
    ranking_unlocked: bool
    ranked_eligible: bool
    provisional: bool
    mine: GlobalCompetitionParticipant | None
    my_score: RegularityScore | None
    my_rank: int | None
    leaderboard: list[RankedParticipant]


def _month_day(value: date) -> str:
    months = (
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    )
    return f"{value.day} {months[value.month - 1]}"


def current_season_window(now: datetime | None = None) -> SeasonWindow:
    current = (now or datetime.now(UTC)).astimezone(GLOBAL_TIMEZONE).date()
    cycle = (current - SEASON_ANCHOR).days // SEASON_DAYS
    start = SEASON_ANCHOR + timedelta(days=cycle * SEASON_DAYS)
    end = start + timedelta(days=SEASON_DAYS - 1)
    return SeasonWindow(
        season_key=f"regularity-{start.isoformat()}",
        title=f"Регулярность · {_month_day(start)} — {_month_day(end)}",
        start_date=start,
        end_date=end,
        join_deadline=start + timedelta(days=JOIN_WINDOW_DAYS - 1),
    )


def schedule_cohort(days: set[int]) -> str:
    if len(days) <= 2:
        return "days_1_2"
    if len(days) == 3:
        return "days_3"
    return "days_4_plus"


def _timezone_name(user: User) -> str:
    raw = (user.goals or {}).get("notification_settings")
    settings = merge_notification_settings(raw if isinstance(raw, dict) else None)
    return str(settings.get("timezone") or "Europe/Moscow")


async def _stored_season(
    session: AsyncSession,
    window: SeasonWindow,
    *,
    lock: bool = False,
) -> GlobalCompetitionSeason | None:
    query = select(GlobalCompetitionSeason).where(
        GlobalCompetitionSeason.season_key == window.season_key
    )
    if lock:
        query = query.with_for_update()
    return await session.scalar(query)


async def _ensure_season(
    session: AsyncSession,
    window: SeasonWindow,
) -> GlobalCompetitionSeason:
    lock_key = 7_310_000_000 + window.start_date.toordinal()
    await session.execute(select(func.pg_advisory_xact_lock(lock_key)))
    season = await _stored_season(session, window, lock=True)
    if season is None:
        season = GlobalCompetitionSeason(
            season_key=window.season_key,
            title=window.title,
            metric="regularity",
            status="open",
            start_date=window.start_date,
            end_date=window.end_date,
            join_deadline=window.join_deadline,
            algorithm_version=ALGORITHM_VERSION,
        )
        session.add(season)
        await session.flush()
    return season


async def _new_alias(session: AsyncSession, season_id: uuid.UUID) -> str:
    for _ in range(5):
        alias = f"Участник {secrets.token_hex(4).upper()}"
        exists = await session.scalar(
            select(GlobalCompetitionParticipant.id).where(
                GlobalCompetitionParticipant.season_id == season_id,
                GlobalCompetitionParticipant.public_alias == alias,
            )
        )
        if exists is None:
            return alias
    raise GlobalCompetitionError


async def join_current_season(
    session: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> None:
    current = now or datetime.now(UTC)
    days = workout_days(user.goals or {})
    if not days:
        raise GlobalScheduleError
    window = current_season_window(current)
    season = await _ensure_season(session, window)
    mine = await session.scalar(
        select(GlobalCompetitionParticipant)
        .where(
            GlobalCompetitionParticipant.season_id == season.id,
            GlobalCompetitionParticipant.user_id == user.id,
        )
        .with_for_update()
    )
    if mine is not None:
        if mine.left_at is not None:
            raise GlobalRejoinError
        await session.commit()
        return
    global_day = current.astimezone(GLOBAL_TIMEZONE).date()
    session.add(
        GlobalCompetitionParticipant(
            season_id=season.id,
            user_id=user.id,
            public_alias=await _new_alias(session, season.id),
            cohort=schedule_cohort(days),
            consented_at=current,
            schedule_days=sorted(days),
            timezone=_timezone_name(user),
            ranked_eligible=global_day <= window.join_deadline,
        )
    )
    await session.commit()


async def leave_current_season(
    session: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> None:
    current = now or datetime.now(UTC)
    window = current_season_window(current)
    season = await _stored_season(session, window)
    if season is None:
        return
    mine = await session.scalar(
        select(GlobalCompetitionParticipant)
        .where(
            GlobalCompetitionParticipant.season_id == season.id,
            GlobalCompetitionParticipant.user_id == user.id,
        )
        .with_for_update()
    )
    if mine is not None and mine.left_at is None:
        mine.left_at = current
        await session.commit()


def rank_scores(
    participants: list[GlobalCompetitionParticipant],
    scores: dict[uuid.UUID, RegularityScore],
) -> list[RankedParticipant]:
    eligible = [
        (participant, scores[participant.user_id])
        for participant in participants
        if participant.ranked_eligible
        and participant.user_id in scores
        and scores[participant.user_id].score is not None
        and scores[participant.user_id].planned >= MIN_RANKED_PLANNED
    ]
    eligible.sort(
        key=lambda item: (
            -(item[1].score or 0),
            -item[1].completed,
            item[0].public_alias,
        )
    )
    ranked: list[RankedParticipant] = []
    previous_score: float | None = None
    current_rank = 0
    for position, (participant, score) in enumerate(eligible, start=1):
        if score.score != previous_score:
            current_rank = position
            previous_score = score.score
        ranked.append(RankedParticipant(participant, score, current_rank))
    return ranked


async def current_season_view(
    session: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> GlobalSeasonView:
    current = now or datetime.now(UTC)
    window = current_season_window(current)
    season = await _stored_season(session, window)
    current_days = workout_days(user.goals or {})
    cohort = schedule_cohort(current_days)
    if season is None:
        return GlobalSeasonView(
            window, "not_joined", ALGORITHM_VERSION, cohort, 0, False,
            current.astimezone(GLOBAL_TIMEZONE).date() <= window.join_deadline,
            True, None, None, None, [],
        )
    mine = await session.scalar(
        select(GlobalCompetitionParticipant).where(
            GlobalCompetitionParticipant.season_id == season.id,
            GlobalCompetitionParticipant.user_id == user.id,
        )
    )
    if mine is not None:
        cohort = mine.cohort
    rows = await session.scalars(
        select(GlobalCompetitionParticipant)
        .join(User, User.id == GlobalCompetitionParticipant.user_id)
        .where(
            GlobalCompetitionParticipant.season_id == season.id,
            GlobalCompetitionParticipant.cohort == cohort,
            GlobalCompetitionParticipant.left_at.is_(None),
            User.is_deleted.is_(False),
        )
    )
    participants = list(rows.all())
    status = "left" if mine is not None and mine.left_at is not None else (
        "joined" if mine is not None else "not_joined"
    )
    score_participants = participants if status == "joined" else []
    scores = await regularity_scores_for_period(
        session,
        start_date=season.start_date,
        end_date=season.end_date,
        participants=score_participants,
        now=current,
    )
    ranked = rank_scores(participants, scores)
    ranking_unlocked = status == "joined" and len(ranked) >= MIN_PUBLIC_COHORT
    my_score = scores.get(user.id) if status == "joined" else None
    my_ranked = next((item for item in ranked if item.participant.user_id == user.id), None)
    return GlobalSeasonView(
        window=window,
        status=status,
        algorithm_version=season.algorithm_version,
        cohort=cohort,
        participants=len(participants),
        ranking_unlocked=ranking_unlocked,
        ranked_eligible=mine.ranked_eligible if mine is not None else (
            current.astimezone(GLOBAL_TIMEZONE).date() <= window.join_deadline
        ),
        provisional=my_score is None or my_score.planned < MIN_RANKED_PLANNED,
        mine=mine,
        my_score=my_score,
        my_rank=my_ranked.rank if ranking_unlocked and my_ranked else None,
        leaderboard=ranked[:20] if ranking_unlocked else [],
    )
