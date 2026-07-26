"""User profile business logic."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User
from app.schemas.user import UserProfileResponse, UserProfileUpdate
from app.services.email_otp_service import EmailOtpError, find_user_by_email, normalize_email


def _onboarding_completed(user: User) -> bool:
    goals = user.goals or {}
    return bool(goals.get("onboarding_completed"))


def to_profile(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        auth_email=user.auth_email,
        anthropometry=user.anthropometry or {},
        goals=user.goals or {},
        subscription_status=user.subscription_status,
        stars_balance=user.stars_balance,
        onboarding_completed=_onboarding_completed(user),
    )


async def update_profile(
    session: AsyncSession,
    user: User,
    data: UserProfileUpdate,
) -> User:
    if data.anthropometry is not None:
        user.anthropometry = {**(user.anthropometry or {}), **data.anthropometry}
        flag_modified(user, "anthropometry")
    if data.goals is not None:
        merged = {**(user.goals or {}), **data.goals}
        # Completing onboarding when core fields present
        if merged.get("primary_goal") and merged.get("level"):
            merged["onboarding_completed"] = True
        user.goals = merged
        flag_modified(user, "goals")
    if data.auth_email is not None:
        # Direct write only clears email. Binding a new address requires OTP verify.
        raw = (data.auth_email or "").strip()
        if not raw:
            user.auth_email = None
        else:
            try:
                email = normalize_email(raw)
            except EmailOtpError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            if (user.auth_email or "").lower() != email:
                other = await find_user_by_email(session, email)
                if other is not None and other.id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Этот email уже привязан к другому аккаунту",
                    )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Чтобы привязать email, подтвердите код из /auth/email/link/*",
                )

    await session.commit()
    await session.refresh(user)
    return user
