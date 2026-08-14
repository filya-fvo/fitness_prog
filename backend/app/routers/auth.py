"""Authentication routes: Telegram initData / email OTP -> JWT."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import InitDataError
from app.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    AuthUserResponse,
    EmailAuthResponse,
    EmailLinkResponse,
    EmailOtpRequest,
    EmailOtpRequestResponse,
    EmailOtpVerifyRequest,
    TelegramAuthRequest,
    TelegramAuthResponse,
)
from app.services.auth_service import authenticate_telegram
from app.services.email_auth_service import (
    request_link_code,
    request_login_code,
    verify_link_code,
    verify_login_code,
)
from app.services.user_service import to_profile

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_response(profile) -> AuthUserResponse:
    goals = profile.goals if isinstance(getattr(profile, "goals", None), dict) else {}
    merged_ids = []
    for raw in goals.get("_merged_from_user_ids") or []:
        try:
            merged_ids.append(uuid.UUID(str(raw)))
        except (TypeError, ValueError):
            continue
    return AuthUserResponse(
        id=profile.id,
        telegram_id=profile.telegram_id,
        username=profile.username,
        auth_email=getattr(profile, "auth_email", None),
        subscription_status=profile.subscription_status,
        onboarding_completed=profile.onboarding_completed,
        merged_from_user_ids=merged_ids,
        last_merge_preference=goals.get("_last_merge_preference"),
    )


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
        logger.warning("initData_validation_failed detail={}", str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Не удалось подтвердить данные авторизации Telegram",
        ) from exc

    profile = to_profile(user)
    logger.info("auth_ok telegram_id={} user_id={}", profile.telegram_id, profile.id)
    return TelegramAuthResponse(
        access_token=token,
        expires_in_days=settings.jwt_expire_days,
        user=_user_response(profile),
    )


@router.post(
    "/email/request-code",
    response_model=EmailOtpRequestResponse,
    status_code=status.HTTP_200_OK,
    summary="Request email OTP for browser login",
)
async def auth_email_request_code(
    body: EmailOtpRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> EmailOtpRequestResponse:
    ip = request.client.host if request.client else None
    result = await request_login_code(
        session,
        email_raw=str(body.email),
        settings=settings,
        request_ip=ip,
    )
    return EmailOtpRequestResponse(**result)


@router.post(
    "/email/verify",
    response_model=EmailAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify email OTP and issue JWT",
)
async def auth_email_verify(
    body: EmailOtpVerifyRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> EmailAuthResponse:
    user, token = await verify_login_code(
        session,
        email_raw=str(body.email),
        code_raw=body.code,
        settings=settings,
    )
    profile = to_profile(user)
    return EmailAuthResponse(
        access_token=token,
        expires_in_days=settings.jwt_expire_days,
        user=_user_response(profile),
    )


@router.post(
    "/email/link/request-code",
    response_model=EmailOtpRequestResponse,
    status_code=status.HTTP_200_OK,
    summary="Request OTP to link email to current account",
)
async def auth_email_link_request_code(
    body: EmailOtpRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> EmailOtpRequestResponse:
    ip = request.client.host if request.client else None
    result = await request_link_code(
        session,
        user=user,
        email_raw=str(body.email),
        settings=settings,
        request_ip=ip,
    )
    return EmailOtpRequestResponse(**result)


@router.post(
    "/email/link/verify",
    response_model=EmailLinkResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify OTP and attach email to current account",
)
async def auth_email_link_verify(
    body: EmailOtpVerifyRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> EmailLinkResponse:
    result = await verify_link_code(
        session,
        user=user,
        email_raw=str(body.email),
        code_raw=body.code,
        settings=settings,
        merge_preference=body.merge_preference,
    )
    if result.merge_required:
        return EmailLinkResponse(
            ok=True,
            message="Найдены два аккаунта. Выберите, какие данные профиля считать основными.",
            merge_required=True,
            merge_preview=result.preview,
        )
    if result.user is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Не удалось объединить аккаунты")
    profile = to_profile(result.user)
    return EmailLinkResponse(
        ok=True,
        message=(
            "Аккаунты объединены. История из почты и Telegram сохранена."
            if result.merged_from_user_ids
            else "Почта привязана. Теперь можно входить через неё в браузере."
        ),
        user=_user_response(profile),
    )
