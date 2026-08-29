"""Administrator support queue and reply API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import require_admin
from app.models.support import SupportMessage, SupportTicket
from app.models.user import User
from app.schemas.support import (
    AdminSupportTicketDetail,
    AdminSupportTicketListResponse,
    SupportCategory,
    SupportMessageCreate,
    SupportMessageResponse,
    SupportStatus,
    SupportStatusUpdate,
)
from app.services import admin_audit, support_notifications, support_service

router = APIRouter(prefix="/admin/support", tags=["admin-support"])


def _not_found(exc: Exception) -> None:
    if isinstance(exc, support_service.SupportTicketNotFoundError):
        raise HTTPException(status_code=404, detail="Обращение не найдено") from exc
    if isinstance(exc, support_service.SupportTicketClosedError):
        raise HTTPException(status_code=409, detail="Закрытое обращение сначала нужно открыть") from exc
    raise exc


def _detail(ticket: SupportTicket, user: User, messages: list[SupportMessage]) -> AdminSupportTicketDetail:
    last = messages[-1] if messages else None
    return AdminSupportTicketDetail(
        id=ticket.id,
        category=ticket.category,
        status=ticket.status,
        subject=ticket.subject,
        last_message_preview=" ".join(last.body.split())[:180] if last else "",
        unread=False,
        last_message_at=ticket.last_message_at,
        created_at=ticket.created_at,
        source_page=ticket.source_page,
        client=ticket.client,
        app_version=ticket.app_version,
        messages=[SupportMessageResponse.model_validate(message) for message in messages],
        user_id=user.id,
        user_label=support_service.user_label(user),
    )


@router.get("", response_model=AdminSupportTicketListResponse)
async def list_tickets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    ticket_status: SupportStatus | None = Query(default=None, alias="status"),
    category: SupportCategory | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminSupportTicketListResponse:
    items, total, waiting = await support_service.list_admin_tickets(
        session,
        page=page,
        page_size=page_size,
        status=ticket_status,
        category=category,
    )
    return AdminSupportTicketListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        waiting_support=waiting,
    )


@router.get("/{ticket_id}", response_model=AdminSupportTicketDetail)
async def get_ticket(
    ticket_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminSupportTicketDetail:
    try:
        ticket, user, messages = await support_service.get_admin_ticket(session, ticket_id)
    except Exception as exc:
        _not_found(exc)
    return _detail(ticket, user, messages)


@router.post(
    "/{ticket_id}/messages",
    response_model=SupportMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def reply(
    ticket_id: uuid.UUID,
    body: SupportMessageCreate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    settings: Settings = Depends(get_settings),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> SupportMessageResponse:
    try:
        message, _user = await support_service.add_admin_reply(
            session,
            admin,
            ticket_id,
            body,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except Exception as exc:
        _not_found(exc)
    if message.delivery_status == "pending":
        try:
            queued = await support_notifications.enqueue_support_reply(settings, message.id)
        except Exception:
            queued = False
        if not queued:
            message.delivery_status = "failed"
            await session.commit()
    return SupportMessageResponse.model_validate(message)


@router.patch("/{ticket_id}/status", response_model=AdminSupportTicketDetail)
async def change_status(
    ticket_id: uuid.UUID,
    body: SupportStatusUpdate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminSupportTicketDetail:
    try:
        await support_service.update_admin_status(
            session,
            ticket_id,
            body.status,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
        ticket, user, messages = await support_service.get_admin_ticket(session, ticket_id)
    except Exception as exc:
        _not_found(exc)
    return _detail(ticket, user, messages)
