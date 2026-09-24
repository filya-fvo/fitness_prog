"""Strictly local-only test account for manual browser QA."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token
from app.models.user import User

LOCAL_TEST_EMAIL = "local-test@filfit.invalid"


async def login_local_test_user(session: AsyncSession, settings: Settings) -> tuple[User, str]:
    """Find or create the isolated local QA account and issue a normal JWT."""
    result = await session.execute(
        select(User).where(User.auth_email == LOCAL_TEST_EMAIL, User.is_deleted.is_(False)),
    )
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            username="local-tester",
            auth_email=LOCAL_TEST_EMAIL,
            anthropometry={"first_name": "Тестовый", "last_name": "пользователь"},
            goals={"onboarding_completed": True},
            subscription_status="free",
            stars_balance=0,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    return user, create_access_token(subject=str(user.id), telegram_id=None, settings=settings)
