"""Account-bound read-only Android reminder preparation."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.android_notifications import AndroidNotificationPlan
from app.services.android_notification_plan import build_android_notification_plan

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/android-plan", response_model=AndroidNotificationPlan)
async def android_plan(
    session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> AndroidNotificationPlan:
    return await build_android_notification_plan(session, user, now=datetime.now(UTC))
