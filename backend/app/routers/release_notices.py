"""Only the authenticated account can read or dismiss its release summary."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.release_notice import ReleaseNoticeItem, ReleaseNoticesResponse
from app.services.release_notices import mark_seen, pending_notices

router = APIRouter(prefix="/notifications/release-notices", tags=["notifications"])


@router.get("", response_model=ReleaseNoticesResponse)
async def list_release_notices(session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    items = await pending_notices(session, user.id)
    return ReleaseNoticesResponse(items=[ReleaseNoticeItem.model_validate(item) for item in items])


@router.post("/{notice_id}/seen")
async def seen_release_notice(notice_id: UUID, session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await mark_seen(session, user.id, notice_id)
    return {"ok": True}
