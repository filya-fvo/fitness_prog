"""User profile business logic."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User
from app.schemas.user import UserProfileResponse, UserProfileUpdate
from app.services.scheduler import local_schedule_day


def _onboarding_completed(user: User) -> bool:
    goals = user.goals or {}
    return bool(goals.get("onboarding_completed"))


def to_profile(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        auth_email=getattr(user, "auth_email", None),
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
        previous_program_id = str((user.goals or {}).get("active_program_id") or "")
        selected_program_id = str(merged.get("active_program_id") or "")
        if selected_program_id != previous_program_id:
            if selected_program_id:
                merged.update(
                    {
                        "active_program_started_at": local_schedule_day(merged).isoformat(),
                        "active_program_next_day": 1,
                        "active_program_week_phase": "light",
                        "active_program_phase_source": "auto",
                        "active_program_workouts_in_phase": 0,
                    }
                )
                merged.pop("active_program_repeat_phase", None)
            else:
                for key in (
                    "active_program_started_at",
                    "active_program_next_day",
                    "active_program_week_phase",
                    "active_program_phase_source",
                    "active_program_workouts_in_phase",
                    "active_program_repeat_phase",
                ):
                    merged.pop(key, None)
        # Completing onboarding when core fields present
        if merged.get("primary_goal") and merged.get("level"):
            merged["onboarding_completed"] = True
        user.goals = merged
        flag_modified(user, "goals")

    await session.commit()
    await session.refresh(user)
    return user
