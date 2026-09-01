"""Read models for friends and private competition scoreboards."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Competition, CompetitionParticipant, Friendship
from app.models.user import User
from app.services.competition_scoring import RegularityScore, participant_local_day, regularity_score


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
        if status in ("active", "finished"):
            my_score = await regularity_score(session, competition, mine, now=current)
            friend_score = await regularity_score(session, competition, theirs, now=current)
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
            )
        )
    return result
