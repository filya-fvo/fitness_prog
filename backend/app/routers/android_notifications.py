"""Account-bound read-only Android reminder preparation."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.android_notifications import AndroidNotificationPlan, AndroidDeliveryUpdate, AndroidDeliveryResponse
from app.services.android_notification_plan import build_android_notification_plan
from app.services.android_notification_delivery import update_android_delivery

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/android-plan", response_model=AndroidNotificationPlan)
async def android_plan(
    session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> AndroidNotificationPlan:
    return await build_android_notification_plan(session, user, now=datetime.now(UTC))


@router.put("/android-delivery", response_model=AndroidDeliveryResponse)
async def android_delivery(
    body: AndroidDeliveryUpdate,
    session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> AndroidDeliveryResponse:
    return AndroidDeliveryResponse(android_delivery=await update_android_delivery(
        session, user.id, body, now=datetime.now(UTC)
    ))
