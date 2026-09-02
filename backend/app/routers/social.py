"""Authenticated friendship and private competition endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.social import (
    CompetitionCreateRequest,
    CompetitionListResponse,
    CompetitionScoreResponse,
    CompetitionSummary,
    CompetitionFactorResult,
    CompetitionFactorSummary,
    CompetitionParticipantAnalytics,
    FriendListResponse,
    FriendSummary,
    GlobalLeaderboardEntry,
    GlobalSeasonResponse,
    SocialActionResponse,
)
from app.services.competition_scoring import RegularityScore
from app.services import competition_analytics, global_competitions, social_queries, social_service

router = APIRouter(tags=["social"])


def _social_error(exc: social_service.SocialError) -> HTTPException:
    if isinstance(exc, social_service.SocialNotFoundError):
        return HTTPException(status_code=404, detail="Связь не найдена")
    if isinstance(exc, social_service.SocialPermissionError):
        return HTTPException(status_code=403, detail="Действие недоступно")
    if isinstance(exc, social_service.SocialBlockedError):
        return HTTPException(status_code=409, detail="Связь с пользователем заблокирована")
    if isinstance(exc, social_service.SocialScheduleError):
        return HTTPException(
            status_code=409,
            detail="Сначала оба пользователя должны настроить дни тренировок",
        )
    if isinstance(exc, social_service.SocialUnavailableError):
        return HTTPException(status_code=409, detail="Пользователь больше недоступен")
    if isinstance(exc, social_service.SocialBaselineError):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=409, detail="Действие сейчас недоступно")


@router.get("/friends", response_model=FriendListResponse)
async def friends(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FriendListResponse:
    items = await social_queries.list_friends(session, user)
    return FriendListResponse(
        items=[
            FriendSummary(
                id=item.friendship.id,
                label=social_queries.user_label(item.friend),
                status=item.friendship.status,
            )
            for item in items
        ]
    )


def _score(value: RegularityScore | None) -> CompetitionScoreResponse | None:
    if value is None:
        return None
    return CompetitionScoreResponse(
        score=value.score,
        completed=value.completed,
        planned=value.planned,
    )


def _analytics(
    value: competition_analytics.ParticipantAnalytics | None,
    *,
    mine: bool,
) -> CompetitionParticipantAnalytics | None:
    if value is None:
        return None
    return CompetitionParticipantAnalytics(
        wins=value.wins,
        factors=[
            CompetitionFactorResult(
                key=result.definition.key,
                metric=result.definition.metric,
                label=result.definition.label,
                status=result.status,
                value=result.value,
                completed=result.completed,
                planned=result.planned,
                baseline_value=result.baseline_value if mine else None,
                latest_value=result.latest_value if mine else None,
                baseline_date=result.baseline_date if mine else None,
                latest_date=result.latest_date if mine else None,
                unit=result.unit if mine else None,
                capped=result.capped,
            )
            for result in value.factors
        ],
    )


def _global_response(view: global_competitions.GlobalSeasonView, user: User) -> GlobalSeasonResponse:
    mine = view.mine
    return GlobalSeasonResponse(
        season_key=view.window.season_key,
        title=view.window.title,
        start_date=view.window.start_date,
        end_date=view.window.end_date,
        join_deadline=view.window.join_deadline,
        status=view.status,
        algorithm_version=view.algorithm_version,
        cohort=view.cohort,
        cohort_label=global_competitions.COHORT_LABELS[view.cohort],
        participant_count=view.participants,
        minimum_cohort_size=global_competitions.MIN_PUBLIC_COHORT,
        ranking_unlocked=view.ranking_unlocked,
        ranked_eligible=view.ranked_eligible,
        provisional=view.provisional,
        my_alias=mine.public_alias if mine is not None else None,
        my_rank=view.my_rank,
        my_score=_score(view.my_score),
        leaderboard=[
            GlobalLeaderboardEntry(
                rank=item.rank,
                alias=item.participant.public_alias,
                score=item.score.score or 0,
                completed=item.score.completed,
                planned=item.score.planned,
                is_me=item.participant.user_id == user.id,
            )
            for item in view.leaderboard
        ],
    )


@router.get("/competitions/global/current", response_model=GlobalSeasonResponse)
async def global_season(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GlobalSeasonResponse:
    view = await global_competitions.current_season_view(session, user)
    return _global_response(view, user)


@router.post(
    "/competitions/global/current/join",
    response_model=SocialActionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def join_global_season(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SocialActionResponse:
    try:
        await global_competitions.join_current_season(session, user)
    except global_competitions.GlobalScheduleError as exc:
        raise HTTPException(
            status_code=409,
            detail="Сначала настройте дни тренировок в профиле",
        ) from exc
    except global_competitions.GlobalRejoinError as exc:
        raise HTTPException(
            status_code=409,
            detail="После выхода вернуться в текущий сезон нельзя",
        ) from exc
    except global_competitions.GlobalCompetitionError as exc:
        raise HTTPException(status_code=409, detail="Не удалось присоединиться к сезону") from exc
    return SocialActionResponse()


@router.post(
    "/competitions/global/current/leave",
    response_model=SocialActionResponse,
)
async def leave_global_season(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SocialActionResponse:
    await global_competitions.leave_current_season(session, user)
    return SocialActionResponse()


@router.get("/competitions", response_model=CompetitionListResponse)
async def competitions(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CompetitionListResponse:
    items = await social_queries.list_competitions(session, user)
    response_items: list[CompetitionSummary] = []
    for item in items:
        definitions = item.definitions
        response_items.append(
            CompetitionSummary(
                id=item.competition.id,
                friendship_id=item.friendship.id,
                friend_label=social_queries.user_label(item.friend),
                status=item.status,
                title=item.competition.title,
                duration_days=item.competition.duration_days,
                start_date=item.competition.start_date,
                end_date=item.competition.end_date,
                algorithm_version=item.competition.algorithm_version,
                created_by_me=item.competition.created_by_user_id == user.id,
                can_accept=(
                    item.status == "pending"
                    and item.competition.created_by_user_id != user.id
                    and item.mine.consented_at is None
                ),
                factors=[
                    CompetitionFactorSummary(
                        key=value.key,
                        metric=value.metric,
                        label=value.label,
                        exercise_id=value.exercise_id,
                    )
                    for value in definitions
                ],
                winner=item.winner,
                my_analytics=_analytics(item.my_analytics, mine=True),
                friend_analytics=_analytics(item.friend_analytics, mine=False),
                my_score=_score(item.my_score),
                friend_score=_score(item.friend_score),
            )
        )
    return CompetitionListResponse(items=response_items)


@router.post(
    "/competitions/friend",
    response_model=SocialActionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_competition(
    body: CompetitionCreateRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SocialActionResponse:
    try:
        await social_service.create_competition(
            session,
            user,
            body.friendship_id,
            body.duration_days,
            title=body.title,
            factors=body.factors,
        )
    except social_service.SocialError as exc:
        raise _social_error(exc) from exc
    return SocialActionResponse()


@router.post("/competitions/{competition_id}/accept", response_model=SocialActionResponse)
async def accept_competition(
    competition_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SocialActionResponse:
    try:
        await social_service.accept_competition(session, user, competition_id)
    except social_service.SocialError as exc:
        raise _social_error(exc) from exc
    return SocialActionResponse()


@router.post("/competitions/{competition_id}/leave", response_model=SocialActionResponse)
async def leave_competition(
    competition_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SocialActionResponse:
    try:
        await social_service.leave_competition(session, user, competition_id)
    except social_service.SocialError as exc:
        raise _social_error(exc) from exc
    return SocialActionResponse()


@router.post("/friends/{friendship_id}/{action}", response_model=SocialActionResponse)
async def change_friendship(
    friendship_id: uuid.UUID,
    action: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SocialActionResponse:
    if action not in {"remove", "block", "unblock"}:
        raise HTTPException(status_code=404, detail="Действие не найдено")
    try:
        await social_service.change_friendship(session, user, friendship_id, action)
    except social_service.SocialError as exc:
        raise _social_error(exc) from exc
    return SocialActionResponse()
