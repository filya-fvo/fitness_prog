"""Authentication routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import InitDataError
from app.schemas.auth import (
    AuthUserResponse,
    TelegramAuthRequest,
    TelegramAuthResponse,
)
from app.services.auth_service import authenticate_telegram
from app.services.user_service import to_profile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/telegram",
    response_model=TelegramAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate Telegram initData and issue JWT",
)
async def auth_telegram(
    body: TelegramAuthRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TelegramAuthResponse:
    """POST /auth/telegram — TZ §8 + API contract."""
    try:
        user, token = await authenticate_telegram(session, body.init_data, settings)
    except InitDataError as exc:
        # TZ §12: log failed initData validations
        logger.warning("initData_validation_failed detail={}", str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    profile = to_profile(user)
    logger.info("auth_ok telegram_id={} user_id={}", profile.telegram_id, profile.id)
    return TelegramAuthResponse(
        access_token=token,
        expires_in_days=settings.jwt_expire_days,
        user=AuthUserResponse(
            id=profile.id,
            telegram_id=profile.telegram_id,
            username=profile.username,
            subscription_status=profile.subscription_status,
            onboarding_completed=profile.onboarding_completed,
        ),
    )
