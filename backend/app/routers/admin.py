"""Admin routes: users list / reset / delete."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import require_admin
from app.models.user import User
from app.schemas.admin import AdminActionResponse, AdminClearRequest, AdminUserListResponse
from app.services import admin_audit, admin_users

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
    _: User = Depends(require_admin),
) -> AdminActionResponse:
    del user_id
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Устаревший полный сброс отключён. Обновите приложение и используйте выборочную очистку.",
    )


@router.post("/users/{user_id}/clear", response_model=AdminActionResponse)
async def admin_clear_user_data(
    user_id: uuid.UUID,
    body: AdminClearRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminActionResponse:
    """Clear an explicitly selected data domain; body is required for safety."""
    if body.scope == "all" and not body.confirm_full_reset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для полного сброса требуется явное подтверждение",
        )
    user = await admin_users.get_user_or_404(session, user_id)
    meta = await admin_users.clear_user_data(
        session,
        user,
        scope=body.scope,
        settings=settings,
        notify=body.notify,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    notification_status = meta.get("notification_status")
    if notification_status in {"sent", "failed"}:
        await admin_audit.record_notification_delivery(
            session,
            context=admin_audit.AuditContext(admin.id, correlation_id),
            user_id=user_id,
            status=notification_status,
            requested=body.notify,
        )
    details = {
        "all": "Профиль очищен. Пользователю нужно заново пройти анкету.",
        "workouts": "Тренировки и подходы очищены. Профиль и программа сохранены.",
        "nutrition": "Дневник питания и вода очищены. Профиль сохранён.",
        "measurements": "Замеры тела очищены. Остальные данные профиля сохранены.",
    }
    return AdminActionResponse(
        ok=True,
        user_id=user_id,
        action=f"clear_{body.scope}",
        notified=bool(meta.get("notified")),
        detail=details[body.scope],
        meta=meta,
    )


@router.delete("/users/{user_id}", response_model=AdminActionResponse)
async def admin_delete_user(
    user_id: uuid.UUID,
    notify: bool = Query(default=True),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminActionResponse:
    user = await admin_users.get_user_or_404(session, user_id)
    meta = await admin_users.delete_user(
        session,
        user,
        settings=settings,
        notify=notify,
        actor_id=admin.id,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    notification_status = meta.get("notification_status")
    if notification_status in {"sent", "failed"}:
        await admin_audit.record_notification_delivery(
            session,
            context=admin_audit.AuditContext(admin.id, correlation_id),
            user_id=user_id,
            status=notification_status,
            requested=notify,
        )
    return AdminActionResponse(
        ok=True,
        user_id=user_id,
        action="delete",
        notified=bool(meta.get("notified")),
        detail="Пользователь перемещён в архив.",
        meta=meta,
    )
