"""Owner-authenticated transport for Telegram account linking."""

import hashlib
import hmac
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.deps import get_current_user
from app.models.user import User
from app.schemas.android_login import (
    AndroidLoginStart,
    AndroidLoginProof,
    AndroidLoginStarted,
    AndroidLoginStatus,
)
from app.schemas.telegram_link import TelegramLinkComplete, TelegramLinkResponse
from app.services import android_login, telegram_link
from app.services.user_service import to_profile
from app.routers.auth import _user_response

router = APIRouter(prefix="/auth/telegram/link", tags=["auth"])


@router.post("/start", response_model=AndroidLoginStarted)
async def start(
    body: AndroidLoginStart,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    source = request.client.host if request.client else "unknown"
    source_hash = hmac.new(
        settings.jwt_secret.encode(), source.encode(), hashlib.sha256
    ).hexdigest()
    return await telegram_link.start_link(
        session,
        user=user,
        challenge=body.challenge,
        bot_username=settings.bot_username,
        source_hash=source_hash,
    )


@router.post("/status", response_model=AndroidLoginStatus, response_model_exclude_none=True)
async def status(
    body: AndroidLoginProof,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    return await android_login.login_status(
        session, body.request_id, body.verifier, owner_user_id=user.id
    )


@router.post("/cancel")
async def cancel(
    body: AndroidLoginProof,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    await android_login.cancel_login(session, body.request_id, body.verifier, owner_user_id=user.id)
    return {"ok": True}


@router.post("/complete", response_model=TelegramLinkResponse, response_model_exclude_none=True)
async def complete(
    body: TelegramLinkComplete,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await telegram_link.complete_link(session, user=user, **body.model_dump())
    if result.merge_required:
        return TelegramLinkResponse(
            message="Найдены два аккаунта. Выберите основные данные профиля.",
            merge_required=True,
            merge_preview=result.preview,
            merge_target_id=result.merge_target_id,
        )
    profile = await to_profile(session, result.user)
    token = create_access_token(
        subject=str(result.user.id),
        telegram_id=result.user.telegram_id,
        settings=settings,
        extra_claims={"auth": "telegram_link"},
    )
    return TelegramLinkResponse(
        message="Telegram подключён. Ваша история сохранена.",
        user=_user_response(profile),
        access_token=token,
    )
