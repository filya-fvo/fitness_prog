"""Read models for friends and private competition scoreboards."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Competition, CompetitionParticipant, Friendship
from app.models.user import User
from app.services import competition_analytics
from app.services.competition_analytics import FactorDefinition, ParticipantAnalytics
from app.services.competition_scoring import RegularityScore, participant_local_day


@dataclass(slots=True)
class FriendView:
    friendship: Friendship
    friend: User


@dataclass(slots=True)
class CompetitionView:
    competition: Competition
    friendship: Friendship
    friend: User
    mine: CompetitionParticipant
    theirs: CompetitionParticipant
    status: str
    my_score: RegularityScore | None
    friend_score: RegularityScore | None
    definitions: list[FactorDefinition]
    my_analytics: ParticipantAnalytics | None
    friend_analytics: ParticipantAnalytics | None
    winner: str | None


def user_label(user: User) -> str:
    username = (user.username or "").strip().lstrip("@")
    return f"@{username}" if username else f"Пользователь · {str(user.id)[:4]}"


async def list_friends(session: AsyncSession, user: User) -> list[FriendView]:
    rows = await session.scalars(
        select(Friendship)
        .where(
            or_(Friendship.user_low_id == user.id, Friendship.user_high_id == user.id),
            Friendship.status.in_(["accepted", "blocked"]),
        )
        .order_by(Friendship.updated_at.desc())
    )
    result: list[FriendView] = []
    for friendship in rows.all():
        if friendship.status == "blocked" and friendship.blocked_by_user_id != user.id:
            continue
        friend_id = (
            friendship.user_high_id if friendship.user_low_id == user.id else friendship.user_low_id
        )
        friend = await session.scalar(
            select(User).where(User.id == friend_id, User.is_deleted.is_(False))
        )
        if friend is not None:
            result.append(FriendView(friendship, friend))
    return result


async def _participants(
    session: AsyncSession,
    competition_id: uuid.UUID,
) -> list[CompetitionParticipant]:
    rows = await session.scalars(
        select(CompetitionParticipant).where(
            CompetitionParticipant.competition_id == competition_id
        )
    )
    return list(rows.all())


async def list_competitions(
    session: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> list[CompetitionView]:
    current = now or datetime.now(UTC)
    mine_rows = await session.scalars(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.user_id == user.id)
        .order_by(CompetitionParticipant.created_at.desc())
        .limit(50)
    )
    result: list[CompetitionView] = []
    for mine in mine_rows.all():
        competition = await session.scalar(
            select(Competition).where(Competition.id == mine.competition_id)
        )
        if competition is None:
            continue
        friendship = await session.scalar(
            select(Friendship).where(Friendship.id == competition.friendship_id)
        )
        if friendship is None or friendship.status == "blocked":
            continue
        participants = await _participants(session, competition.id)
        theirs = next((row for row in participants if row.user_id != user.id), None)
        if theirs is None:
            continue
        friend = await session.scalar(
            select(User).where(User.id == theirs.user_id, User.is_deleted.is_(False))
        )
        if friend is None:
            continue
        status = competition.status
        if status == "active" and competition.end_date is not None:
            if participant_local_day(mine, current) > competition.end_date:
                status = "finished"
        my_score = friend_score = None
        my_analytics = friend_analytics = None
        winner = None
        definitions = await competition_analytics.factor_definitions(session, competition)
        if status in ("active", "finished"):
            my_analytics = await competition_analytics.participant_analytics(
                session,
                competition,
                mine,
                definitions,
                as_of=participant_local_day(mine, current),
            )
            friend_analytics = await competition_analytics.participant_analytics(
                session,
                competition,
                theirs,
                definitions,
                as_of=participant_local_day(theirs, current),
            )
            winner = competition_analytics.assign_factor_wins(my_analytics, friend_analytics)
            if any(item.metric == "regularity" for item in definitions):
                my_factor = next(
                    item for item in my_analytics.factors if item.definition.metric == "regularity"
                )
                friend_factor = next(
                    item
                    for item in friend_analytics.factors
                    if item.definition.metric == "regularity"
                )
                my_score = RegularityScore(
                    my_factor.value,
                    my_factor.completed or 0,
                    my_factor.planned or 0,
                )
                friend_score = RegularityScore(
                    friend_factor.value,
                    friend_factor.completed or 0,
                    friend_factor.planned or 0,
                )
        result.append(
            CompetitionView(
                competition,
                friendship,
                friend,
                mine,
                theirs,
                status,
                my_score,
                friend_score,
                definitions,
                my_analytics,
                friend_analytics,
                winner,
            )
        )
    return result
