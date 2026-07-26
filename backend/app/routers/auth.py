"""Authentication routes: Telegram + email OTP."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import InitDataError, create_access_token
from app.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    AuthUserResponse,
    EmailOtpRequest,
    EmailOtpRequestResponse,
    EmailOtpVerifyRequest,
    TelegramAuthRequest,
    TelegramAuthResponse,
)
from app.services.auth_service import authenticate_telegram
from app.services.email_delivery import EmailDeliveryError
from app.services.email_otp_service import EmailOtpError, request_otp, verify_otp
from app.services.user_service import to_profile

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    if request.client:
        return request.client.host
    return None


def _auth_user_response(user: User) -> AuthUserResponse:
    profile = to_profile(user)
    return AuthUserResponse(
        id=profile.id,
        telegram_id=profile.telegram_id,
        username=profile.username,
        auth_email=profile.auth_email,
        subscription_status=profile.subscription_status,
        onboarding_completed=profile.onboarding_completed,
    )


def _token_response(user: User, settings: Settings) -> TelegramAuthResponse:
    token = create_access_token(
        subject=str(user.id),
        telegram_id=user.telegram_id,
        settings=settings,
    )
    return TelegramAuthResponse(
        access_token=token,
        expires_in_days=settings.jwt_expire_days,
        user=_auth_user_response(user),
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
            detail=str(exc),
        ) from exc

    profile = to_profile(user)
    logger.info("auth_ok telegram_id={} user_id={}", profile.telegram_id, profile.id)
    return TelegramAuthResponse(
        access_token=token,
        expires_in_days=settings.jwt_expire_days,
        user=_auth_user_response(user),
    )


@router.post(
    "/email/request-code",
    response_model=EmailOtpRequestResponse,
    summary="Request OTP code for web email login",
)
async def auth_email_request_code(
    body: EmailOtpRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> EmailOtpRequestResponse:
    try:
        result = await request_otp(
            session,
            settings,
            email_raw=body.email,
            purpose="login",
            request_ip=_client_ip(request),
        )
    except EmailOtpError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    logger.info("email_otp_requested purpose=login email={}", result.get("email"))
    return EmailOtpRequestResponse(**result)


@router.post(
    "/email/verify",
    response_model=TelegramAuthResponse,
    summary="Verify email OTP and issue JWT",
)
async def auth_email_verify(
    body: EmailOtpVerifyRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TelegramAuthResponse:
    try:
        user = await verify_otp(
            session,
            settings,
            email_raw=body.email,
            code_raw=body.code,
            purpose="login",
        )
    except EmailOtpError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    logger.info("auth_ok_email user_id={} email={}", user.id, user.auth_email)
    return _token_response(user, settings)


@router.post(
    "/email/link/request-code",
    response_model=EmailOtpRequestResponse,
    summary="Request OTP to bind email to current account",
)
async def auth_email_link_request(
    body: EmailOtpRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> EmailOtpRequestResponse:
    try:
        result = await request_otp(
            session,
            settings,
            email_raw=body.email,
            purpose="link",
            user=user,
            request_ip=_client_ip(request),
        )
    except EmailOtpError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    logger.info(
        "email_otp_requested purpose=link user_id={} email={}",
        user.id,
        result.get("email"),
    )
    return EmailOtpRequestResponse(**result)


@router.post(
    "/email/link/verify",
    response_model=AuthUserResponse,
    summary="Verify OTP and bind email to current account",
)
async def auth_email_link_verify(
    body: EmailOtpVerifyRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> AuthUserResponse:
    try:
        updated = await verify_otp(
            session,
            settings,
            email_raw=body.email,
            code_raw=body.code,
            purpose="link",
            user=user,
        )
    except EmailOtpError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    logger.info("email_linked user_id={} email={}", updated.id, updated.auth_email)
    return _auth_user_response(updated)
