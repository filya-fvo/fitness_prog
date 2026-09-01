"""Authenticated referral invite endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.invite import (
    InviteAcceptResponse,
    InviteCreatedResponse,
    InviteCredential,
    InvitePreviewResponse,
    InviteRevokeResponse,
)
from app.services import invite_service

router = APIRouter(prefix="/invites", tags=["invites"])


def _invite_error(exc: invite_service.InviteError) -> HTTPException:
    if isinstance(exc, invite_service.InviteNotFoundError):
        return HTTPException(status_code=404, detail="Приглашение не найдено")
    if isinstance(exc, invite_service.InviteExpiredError):
        return HTTPException(status_code=410, detail="Срок действия приглашения истёк")
    if isinstance(exc, invite_service.InviteSelfAcceptError):
        return HTTPException(status_code=409, detail="Нельзя принять собственное приглашение")
    if isinstance(exc, invite_service.InviteRateLimitError):
        return HTTPException(
            status_code=429,
            detail="Сегодня создано слишком много приглашений. Попробуйте завтра.",
        )
    if isinstance(exc, invite_service.InviteLookupRateLimitError):
        return HTTPException(
            status_code=429,
            detail="Слишком много попыток ввода кода. Попробуйте позже.",
        )
    return HTTPException(status_code=409, detail="Приглашение больше недоступно")


@router.post("", response_model=InviteCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> InviteCreatedResponse:
    try:
        created = await invite_service.create_invite(session, user, settings)
    except invite_service.InviteError as exc:
        raise _invite_error(exc) from exc
    return InviteCreatedResponse(
        id=created.invite.id,
        token=created.token,
        code=created.code,
        web_url=created.web_url,
        telegram_url=created.telegram_url,
        expires_at=created.invite.expires_at,
    )


@router.post("/preview", response_model=InvitePreviewResponse)
async def preview_invite(
    body: InviteCredential,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> InvitePreviewResponse:
    try:
        preview = await invite_service.preview_invite(session, user, body.value, settings)
    except invite_service.InviteError as exc:
        raise _invite_error(exc) from exc
    return InvitePreviewResponse(
        inviter_label=preview.inviter_label,
        expires_at=preview.invite.expires_at,
        already_accepted=preview.already_accepted,
        mode=preview.mode,
        competition_duration_days=14 if preview.mode == "social" else None,
    )


@router.post("/accept", response_model=InviteAcceptResponse)
async def accept_invite(
    body: InviteCredential,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> InviteAcceptResponse:
    try:
        accepted = await invite_service.accept_invite(session, user, body.value, settings)
    except invite_service.InviteError as exc:
        raise _invite_error(exc) from exc
    return InviteAcceptResponse(
        inviter_label=accepted.inviter_label,
        already_accepted=accepted.already_accepted,
        mode=accepted.mode,
        friendship_id=accepted.friendship_id,
        competition_id=accepted.competition_id,
    )


@router.post("/{invite_id}/revoke", response_model=InviteRevokeResponse)
async def revoke_invite(
    invite_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InviteRevokeResponse:
    try:
        await invite_service.revoke_invite(session, user, invite_id)
    except invite_service.InviteError as exc:
        raise _invite_error(exc) from exc
    return InviteRevokeResponse()
