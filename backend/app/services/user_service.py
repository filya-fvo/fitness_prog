"""User profile business logic."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserProfileResponse, UserProfileUpdate


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
    if data.goals is not None:
        merged = {**(user.goals or {}), **data.goals}
        # Completing onboarding when core fields present
        if merged.get("primary_goal") and merged.get("level"):
            merged["onboarding_completed"] = True
        user.goals = merged
    if data.auth_email is not None:
        user.auth_email = data.auth_email

    await session.commit()
    await session.refresh(user)
    return user
