"""Feedback helpers.

User-to-admin messages are sent from the user's own Telegram account via
t.me/<admin>?text=... deep link on the frontend (not via Bot API).

This router only exposes the configured admin username for the Mini App UI.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackTargetResponse(BaseModel):
    admin_username: str
    note: str = (
        "Open https://t.me/<admin_username>?text=... so the user sends the message "
        "from their own account."
    )


@router.get("/target", response_model=FeedbackTargetResponse)
async def feedback_target(
    settings: Settings = Depends(get_settings),
) -> FeedbackTargetResponse:
    names = sorted(settings.admin_username_set)
    username = names[0] if names else "Filatov_Slava"
    return FeedbackTargetResponse(admin_username=username)
