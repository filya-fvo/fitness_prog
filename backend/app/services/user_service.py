"""User profile business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User
from app.schemas.user import UserProfileResponse, UserProfileUpdate
from app.services.scheduler import local_schedule_day
from app.services.schedule_replacement import SCHEDULE_CHANGE_REQUESTS_KEY
from app.services.workout_schedule_occurrence import RESCHEDULE_RECEIPTS_KEY
from app.services.legal_consent import get_legal_status
from app.services.subscription_service import get_subscription_state, legacy_subscription_status


def _onboarding_completed(user: User) -> bool:
    goals = user.goals or {}
    return bool(goals.get("onboarding_completed"))


async def to_profile(session: AsyncSession, user: User) -> UserProfileResponse:
    subscription = await get_subscription_state(session, user.id)
    return UserProfileResponse(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        auth_email=getattr(user, "auth_email", None),
        anthropometry=user.anthropometry or {},
        goals=user.goals or {},
        subscription=subscription,
        subscription_status=legacy_subscription_status(subscription),
        stars_balance=user.stars_balance,
        onboarding_completed=_onboarding_completed(user),
        legal_status=await get_legal_status(session, user.id),
    )


async def update_profile(
    session: AsyncSession,
    user: User,
    data: UserProfileUpdate,
) -> User:
    if data.anthropometry is not None or data.goals is not None:
        await session.execute(select(User.id).where(User.id == user.id).with_for_update())
        await session.refresh(user, attribute_names=["goals", "anthropometry"])
    if data.anthropometry is not None:
        user.anthropometry = {**(user.anthropometry or {}), **data.anthropometry}
        flag_modified(user, "anthropometry")
    if data.goals is not None:
        goal_patch = {
            key: value for key, value in data.goals.items()
            if key not in {RESCHEDULE_RECEIPTS_KEY, SCHEDULE_CHANGE_REQUESTS_KEY}
        }
        merged = {**(user.goals or {}), **goal_patch}
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
