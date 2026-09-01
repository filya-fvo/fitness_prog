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
    FriendListResponse,
    FriendSummary,
    SocialActionResponse,
)
from app.services.competition_scoring import RegularityScore
from app.services import social_queries, social_service

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


@router.get("/competitions", response_model=CompetitionListResponse)
async def competitions(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CompetitionListResponse:
    items = await social_queries.list_competitions(session, user)
    return CompetitionListResponse(
        items=[
            CompetitionSummary(
                id=item.competition.id,
                friendship_id=item.friendship.id,
                friend_label=social_queries.user_label(item.friend),
                status=item.status,
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
                my_score=_score(item.my_score),
                friend_score=_score(item.friend_score),
            )
            for item in items
        ]
    )


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
