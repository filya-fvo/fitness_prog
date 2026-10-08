"""Native handshake transport; canonical account resolution stays in auth_service."""

import hashlib
import hmac
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas.android_login import (
    AndroidLoginStart,
    AndroidLoginProof,
    AndroidLoginStarted,
    AndroidLoginStatus,
)
from app.schemas.auth import TelegramAuthResponse
from app.services import android_login
from app.services.auth_service import authenticate_telegram_user
from app.services.user_service import to_profile
from app.routers.auth import _user_response

router = APIRouter(prefix="/auth/android/telegram", tags=["auth"])


@router.post("/start", response_model=AndroidLoginStarted)
async def start(
    body: AndroidLoginStart,
    request: Request,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    source = request.client.host if request.client else "unknown"
    source_hash = hmac.new(
        settings.jwt_secret.encode(), source.encode(), hashlib.sha256
    ).hexdigest()
    return await android_login.start_login(
        session, body.challenge, settings.bot_username, source_hash
    )


@router.post("/status", response_model=AndroidLoginStatus, response_model_exclude_none=True)
async def status(body: AndroidLoginProof, session: AsyncSession = Depends(get_db)):
    return await android_login.login_status(session, body.request_id, body.verifier)


@router.post("/cancel")
async def cancel(body: AndroidLoginProof, session: AsyncSession = Depends(get_db)):
    await android_login.cancel_login(session, body.request_id, body.verifier)
    return {"ok": True}


@router.post("/exchange", response_model=TelegramAuthResponse)
async def exchange(
    body: AndroidLoginProof,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    actor = await android_login.consume_login(session, body.request_id, body.verifier)
    user, token = await authenticate_telegram_user(session, actor, settings)
    profile = await to_profile(session, user)
    return TelegramAuthResponse(
        access_token=token, expires_in_days=settings.jwt_expire_days, user=_user_response(profile)
    )
