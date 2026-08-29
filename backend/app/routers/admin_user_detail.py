"""Administrator-only detail card and assisted user actions."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import require_admin
from app.models.user import User
from app.schemas.admin import AdminActionResponse
from app.schemas.admin_user import (
    AdminNotificationToggleRequest,
    AdminResendGuideRequest,
    AdminServiceMessageRequest,
    AdminUserActivity,
    AdminUserCommunications,
    AdminUserSummary,
)
from app.services import admin_audit, admin_user_actions, admin_user_detail, admin_user_export

router = APIRouter(prefix="/admin/users", tags=["admin"])


@router.get("/{user_id}/summary", response_model=AdminUserSummary)
async def admin_user_summary(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminUserSummary:
    return await admin_user_detail.get_summary(session, user_id)


@router.get("/{user_id}/activity", response_model=AdminUserActivity)
async def admin_user_activity(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminUserActivity:
    return await admin_user_detail.get_activity(session, user_id)


@router.get("/{user_id}/communications", response_model=AdminUserCommunications)
async def admin_user_communications(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminUserCommunications:
    return await admin_user_detail.get_communications(session, user_id)


@router.post("/{user_id}/message", response_model=AdminActionResponse)
async def admin_user_message(
    user_id: uuid.UUID,
    body: AdminServiceMessageRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminActionResponse:
    return await admin_user_actions.send_service_message(
        session,
        user_id,
        text=body.text,
        channel=body.channel,
        confirmed_user_consent=body.confirmed_user_consent,
        settings=settings,
        context=admin_audit.AuditContext(admin.id, correlation_id),
    )


@router.post("/{user_id}/resend-guide", response_model=AdminActionResponse)
async def admin_user_resend_guide(
    user_id: uuid.UUID,
    body: AdminResendGuideRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminActionResponse:
    return await admin_user_actions.resend_guide(
        session,
        user_id,
        kind=body.kind,
        settings=settings,
        context=admin_audit.AuditContext(admin.id, correlation_id),
    )


@router.patch("/{user_id}/notifications", response_model=AdminActionResponse)
async def admin_user_notifications(
    user_id: uuid.UUID,
    body: AdminNotificationToggleRequest,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminActionResponse:
    if not body.confirmed_user_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нужно подтвердить явный запрос пользователя",
        )
    return await admin_user_actions.set_notifications_enabled(
        session,
        user_id,
        enabled=body.enabled,
        context=admin_audit.AuditContext(admin.id, correlation_id),
    )


@router.post("/{user_id}/export")
async def admin_user_export_download(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> Response:
    payload = await admin_user_export.prepare_user_export(
        session,
        user_id,
        context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    content = json.dumps(jsonable_encoder(payload), ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"fitness-user-{str(user_id)[:8]}-{datetime.now(UTC):%Y%m%d}.json"
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
