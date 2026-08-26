"""Administrator-only read API for the immutable action journal."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import require_admin
from app.models.user import User
from app.schemas.admin_audit import AdminAuditListResponse
from app.services import admin_audit

router = APIRouter(prefix="/admin/audit", tags=["admin-audit"])


@router.get("", response_model=AdminAuditListResponse)
async def list_admin_audit_events(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    actor_user_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None, min_length=3, max_length=80, pattern=r"^[a-z][a-z0-9_.]+$"),
    result: Literal["success", "failure"] | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminAuditListResponse:
    if date_from is not None and date_from.tzinfo is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Укажите часовой пояс начала периода")
    if date_to is not None and date_to.tzinfo is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Укажите часовой пояс конца периода")
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Начало периода позже окончания")

    items, total, actors, actions = await admin_audit.list_events(
        session,
        date_from=date_from,
        date_to=date_to,
        actor_user_id=actor_user_id,
        action=action,
        result=result,
        limit=limit,
        offset=offset,
    )
    return AdminAuditListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        actors=actors,
        actions=actions,
    )
