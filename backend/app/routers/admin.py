"""Admin routes: users list / reset / delete."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import require_admin
from app.models.user import User
from app.schemas.admin import AdminActionResponse, AdminUserListResponse
from app.services import admin_users

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
async def admin_list_users(
    q: str | None = Query(default=None, description="Search name/username/email/tg id"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminUserListResponse:
    items, total = await admin_users.list_users(session, q=q, limit=limit, offset=offset)
    return AdminUserListResponse(items=items, total=total)


@router.post("/users/{user_id}/reset", response_model=AdminActionResponse)
async def admin_reset_user(
    user_id: uuid.UUID,
    notify: bool = Query(default=True),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: User = Depends(require_admin),
) -> AdminActionResponse:
    user = await admin_users.get_user_or_404(session, user_id)
    meta = await admin_users.reset_user_profile(
        session, user, settings=settings, notify=notify
    )
    return AdminActionResponse(
        ok=True,
        user_id=user_id,
        action="reset",
        notified=bool(meta.get("notified")),
        detail="Профиль очищен. Пользователю нужно заново пройти анкету.",
        meta=meta,
    )


@router.delete("/users/{user_id}", response_model=AdminActionResponse)
async def admin_delete_user(
    user_id: uuid.UUID,
    notify: bool = Query(default=True),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
) -> AdminActionResponse:
    user = await admin_users.get_user_or_404(session, user_id)
    meta = await admin_users.delete_user(
        session,
        user,
        settings=settings,
        notify=notify,
        actor_id=admin.id,
    )
    return AdminActionResponse(
        ok=True,
        user_id=user_id,
        action="delete",
        notified=bool(meta.get("notified")),
        detail="Пользователь удалён (soft-delete).",
        meta=meta,
    )
