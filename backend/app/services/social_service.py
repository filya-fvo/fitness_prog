"""Friendship lifecycle and consent-based private competitions."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Competition, CompetitionParticipant, Friendship
from app.models.user import User
from app.schemas.social import CompetitionFactor
from app.services import competition_analytics
from app.services.notification_prefs import merge_notification_settings
from app.services.scheduler import local_schedule_day, workout_days

ALGORITHM_VERSION = "regularity_v1"


class SocialError(RuntimeError):
    pass


class SocialNotFoundError(SocialError):
    pass


class SocialBlockedError(SocialError):
    pass


class SocialConflictError(SocialError):
    pass


class SocialPermissionError(SocialError):
    pass


class SocialScheduleError(SocialError):
    pass


class SocialUnavailableError(SocialError):
    pass


class SocialBaselineError(SocialError):
    pass


@dataclass(slots=True)
class SocialLinkResult:
    friendship: Friendship
    competition: Competition | None


def ordered_pair(first: uuid.UUID, second: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    if first == second:
        raise SocialConflictError
    return (first, second) if first.int < second.int else (second, first)


def _timezone_name(user: User) -> str:
    raw = (user.goals or {}).get("notification_settings")
    settings = merge_notification_settings(raw if isinstance(raw, dict) else None)
    return str(settings.get("timezone") or "Europe/Moscow")


def _snapshot_participant(
    participant: CompetitionParticipant,
    user: User,
    now: datetime,
    baseline: dict[str, object],
) -> None:
    participant.consented_at = participant.consented_at or now
    participant.joined_at = now
    participant.left_at = None
    participant.schedule_days = sorted(workout_days(user.goals or {}))
    participant.timezone = _timezone_name(user)
    participant.baseline = baseline


async def find_friendship(
    session: AsyncSession,
    first_id: uuid.UUID,
    second_id: uuid.UUID,
    *,
    lock: bool = False,
) -> Friendship | None:
    low, high = ordered_pair(first_id, second_id)
    query = select(Friendship).where(
        Friendship.user_low_id == low,
        Friendship.user_high_id == high,
    )
    if lock:
        query = query.with_for_update()
    return await session.scalar(query)


async def _lock_pair(
    session: AsyncSession,
    first_id: uuid.UUID,
    second_id: uuid.UUID,
) -> None:
    """Serialize first friendship creation for the same unordered user pair."""
    low, high = ordered_pair(first_id, second_id)
    lock_key = (low.int ^ high.int) & ((1 << 63) - 1)
    await session.execute(select(func.pg_advisory_xact_lock(lock_key)))


async def ensure_social_allowed(
    session: AsyncSession,
    first_id: uuid.UUID,
    second_id: uuid.UUID,
) -> Friendship | None:
    friendship = await find_friendship(session, first_id, second_id)
    if friendship is not None and friendship.status == "blocked":
        raise SocialBlockedError
    return friendship


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


async def _activate(
    session: AsyncSession,
    competition: Competition,
    users: tuple[User, User],
    now: datetime,
) -> None:
    participants = await _participants(session, competition.id)
    by_user = {row.user_id: row for row in participants}
    try:
        definitions = await competition_analytics.factor_definitions(session, competition)
    except competition_analytics.CompetitionFactorError as exc:
        raise SocialBaselineError(str(exc)) from exc
    requires_schedule = any(item.metric == "regularity" for item in definitions)
    if requires_schedule and not all(workout_days(user.goals or {}) for user in users):
        raise SocialScheduleError
    baselines: dict[uuid.UUID, dict[str, object]] = {}
    start_date = local_schedule_day(users[0].goals or {}, now)
    try:
        for user in users:
            participant = by_user.get(user.id) or CompetitionParticipant(
                competition_id=competition.id,
                user_id=user.id,
            )
            baselines[user.id] = await competition_analytics.capture_participant_baseline(
                session, participant, definitions, start_date
            )
    except competition_analytics.CompetitionBaselineError as exc:
        raise SocialBaselineError(str(exc)) from exc
    for user in users:
        participant = by_user.get(user.id)
        if participant is None:
            participant = CompetitionParticipant(competition_id=competition.id, user_id=user.id)
            session.add(participant)
        _snapshot_participant(participant, user, now, baselines[user.id])
    competition.status = "active"
    competition.start_date = start_date
    competition.end_date = competition.start_date + timedelta(days=competition.duration_days - 1)


async def _open_competition(
    session: AsyncSession,
    friendship_id: uuid.UUID,
    *,
    now: datetime,
    local_day: date,
) -> Competition | None:
    competition = await session.scalar(
        select(Competition)
        .where(
            Competition.friendship_id == friendship_id,
            Competition.status.in_(["pending", "active"]),
        )
        .order_by(Competition.created_at.desc())
        .with_for_update()
    )
    if (
        competition is not None
        and competition.status == "active"
        and competition.end_date is not None
        and local_day > competition.end_date
    ):
        competition.status = "finished"
        competition.finished_at = now
        await session.flush()
        return None
    return competition


async def accept_link_offer(
    session: AsyncSession,
    inviter: User,
    invitee: User,
    *,
    now: datetime,
) -> SocialLinkResult:
    await _lock_pair(session, inviter.id, invitee.id)
    friendship = await find_friendship(session, inviter.id, invitee.id, lock=True)
    if friendship is not None and friendship.status == "blocked":
        raise SocialBlockedError
    if friendship is None:
        low, high = ordered_pair(inviter.id, invitee.id)
        friendship = Friendship(
            user_low_id=low,
            user_high_id=high,
            initiated_by_user_id=inviter.id,
            status="accepted",
            accepted_at=now,
        )
        session.add(friendship)
        await session.flush()
    elif friendship.status != "accepted":
        friendship.status = "accepted"
        friendship.accepted_at = now
        friendship.removed_at = None

    competition = await _open_competition(
        session,
        friendship.id,
        now=now,
        local_day=local_schedule_day(inviter.goals or {}, now),
    )
    if competition is not None and competition.status == "active":
        return SocialLinkResult(friendship, competition)
    if competition is None:
        competition = Competition(
            friendship_id=friendship.id,
            created_by_user_id=inviter.id,
            status="pending",
            duration_days=14,
            algorithm_version=ALGORITHM_VERSION,
        )
        session.add(competition)
        await session.flush()
    try:
        await _activate(session, competition, (inviter, invitee), now)
    except SocialScheduleError:
        competition.status = "cancelled"
        competition.finished_at = now
        return SocialLinkResult(friendship, None)
    return SocialLinkResult(friendship, competition)


async def create_competition(
    session: AsyncSession,
    user: User,
    friendship_id: uuid.UUID,
    duration_days: int,
    title: str | None = None,
    factors: list[CompetitionFactor] | None = None,
    *,
    now: datetime | None = None,
) -> Competition:
    current = now or datetime.now(UTC)
    friendship = await session.scalar(
        select(Friendship).where(Friendship.id == friendship_id).with_for_update()
    )
    if friendship is None:
        raise SocialNotFoundError
    if user.id not in (friendship.user_low_id, friendship.user_high_id):
        raise SocialPermissionError
    if friendship.status == "blocked":
        raise SocialBlockedError
    if friendship.status != "accepted":
        raise SocialConflictError
    if await _open_competition(
        session,
        friendship.id,
        now=current,
        local_day=local_schedule_day(user.goals or {}, current),
    ) is not None:
        raise SocialConflictError
    friend_id = friendship.user_high_id if friendship.user_low_id == user.id else friendship.user_low_id
    friend = await session.scalar(
        select(User).where(User.id == friend_id, User.is_deleted.is_(False))
    )
    if friend is None:
        raise SocialUnavailableError
    selected_factors = factors or [CompetitionFactor(metric="regularity")]
    requires_schedule = any(item.metric == "regularity" for item in selected_factors)
    if requires_schedule and (not workout_days(user.goals or {}) or not workout_days(friend.goals or {})):
        raise SocialScheduleError
    competition = Competition(
        friendship_id=friendship.id,
        created_by_user_id=user.id,
        status="pending",
        title=title,
        metric="custom" if len(selected_factors) > 1 else selected_factors[0].metric,
        factors=[item.model_dump(mode="json", exclude_none=True) for item in selected_factors],
        duration_days=duration_days,
        algorithm_version=competition_analytics.ALGORITHM_VERSION,
    )
    try:
        definitions = await competition_analytics.factor_definitions(session, competition)
        await competition_analytics.capture_participant_baseline(
            session,
            CompetitionParticipant(competition_id=competition.id, user_id=user.id),
            definitions,
            local_schedule_day(user.goals or {}, current),
        )
    except competition_analytics.CompetitionFactorError as exc:
        raise SocialBaselineError(str(exc)) from exc
    session.add(competition)
    await session.flush()
    session.add_all(
        [
            CompetitionParticipant(
                competition_id=competition.id,
                user_id=user.id,
                consented_at=current,
            ),
            CompetitionParticipant(competition_id=competition.id, user_id=friend_id),
        ]
    )
    await session.commit()
    return competition


async def accept_competition(
    session: AsyncSession,
    user: User,
    competition_id: uuid.UUID,
    *,
    now: datetime | None = None,
) -> None:
    current = now or datetime.now(UTC)
    competition = await session.scalar(
        select(Competition).where(Competition.id == competition_id).with_for_update()
    )
    if competition is None:
        raise SocialNotFoundError
    if competition.status not in ("pending", "active"):
        raise SocialConflictError
    friendship = await session.scalar(
        select(Friendship).where(Friendship.id == competition.friendship_id)
    )
    if friendship is None or user.id not in (friendship.user_low_id, friendship.user_high_id):
        raise SocialPermissionError
    if friendship.status == "blocked":
        raise SocialBlockedError
    if friendship.status != "accepted":
        raise SocialConflictError
    if competition.status == "active":
        return
    if competition.created_by_user_id == user.id:
        raise SocialConflictError
    users: list[User] = []
    for user_id in (friendship.user_low_id, friendship.user_high_id):
        item = await session.scalar(
            select(User).where(User.id == user_id, User.is_deleted.is_(False))
        )
        if item is None:
            raise SocialUnavailableError
        users.append(item)
    await _activate(session, competition, (users[0], users[1]), current)
    await session.commit()


async def leave_competition(
    session: AsyncSession,
    user: User,
    competition_id: uuid.UUID,
    *,
    now: datetime | None = None,
) -> None:
    current = now or datetime.now(UTC)
    competition = await session.scalar(
        select(Competition).where(Competition.id == competition_id).with_for_update()
    )
    if competition is None:
        raise SocialNotFoundError
    participant = await session.scalar(
        select(CompetitionParticipant).where(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.user_id == user.id,
        )
    )
    if participant is None:
        raise SocialPermissionError
    if competition.status in ("pending", "active"):
        participant.left_at = current
        competition.status = "cancelled"
        competition.finished_at = current
        await session.commit()


async def change_friendship(
    session: AsyncSession,
    user: User,
    friendship_id: uuid.UUID,
    action: str,
    *,
    now: datetime | None = None,
) -> None:
    current = now or datetime.now(UTC)
    friendship = await session.scalar(
        select(Friendship).where(Friendship.id == friendship_id).with_for_update()
    )
    if friendship is None:
        raise SocialNotFoundError
    if user.id not in (friendship.user_low_id, friendship.user_high_id):
        raise SocialPermissionError
    if friendship.status == "blocked" and action != "unblock":
        raise SocialBlockedError
    if action == "unblock":
        if friendship.status != "blocked" or friendship.blocked_by_user_id != user.id:
            raise SocialConflictError
        friendship.status = "removed"
        friendship.blocked_at = None
        friendship.blocked_by_user_id = None
        friendship.removed_at = current
    elif action == "block":
        friendship.status = "blocked"
        friendship.blocked_at = current
        friendship.blocked_by_user_id = user.id
        friendship.removed_at = None
    elif action == "remove":
        if friendship.status != "accepted":
            raise SocialConflictError
        friendship.status = "removed"
        friendship.removed_at = current
    else:
        raise SocialConflictError
    competitions = await session.scalars(
        select(Competition).where(
            Competition.friendship_id == friendship.id,
            Competition.status.in_(["pending", "active"]),
        )
    )
    for competition in competitions.all():
        competition.status = "cancelled"
        competition.finished_at = current
    await session.commit()
