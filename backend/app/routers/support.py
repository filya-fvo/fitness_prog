"""Authenticated in-app support ticket API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.support import SupportTicket
from app.models.user import User
from app.schemas.support import (
    SupportMessageCreate,
    SupportMessageResponse,
    SupportTicketCreate,
    SupportTicketDetail,
    SupportTicketListResponse,
    SupportTicketSummary,
)
from app.services import support_service

router = APIRouter(prefix="/support", tags=["support"])


def _detail(ticket: SupportTicket, messages) -> SupportTicketDetail:
    last = messages[-1] if messages else None
    return SupportTicketDetail(
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
    )


def _raise_support_error(exc: Exception) -> None:
    if isinstance(exc, support_service.SupportTicketNotFoundError):
        raise HTTPException(status_code=404, detail="Обращение не найдено") from exc
    if isinstance(exc, support_service.SupportTicketClosedError):
        raise HTTPException(status_code=409, detail="Обращение закрыто") from exc
    if isinstance(exc, support_service.SupportRateLimitError):
        raise HTTPException(
            status_code=429,
            detail="Слишком много сообщений. Попробуйте отправить позже.",
        ) from exc
    raise exc


@router.get("/tickets", response_model=SupportTicketListResponse)
async def list_tickets(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketListResponse:
    items = await support_service.list_user_tickets(session, user.id)
    return SupportTicketListResponse(items=items, total=len(items))


@router.post(
    "/tickets",
    response_model=SupportTicketSummary,
    status_code=status.HTTP_201_CREATED,
)
async def create_ticket(
    body: SupportTicketCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketSummary:
    try:
        ticket = await support_service.create_ticket(session, user, body)
        items = await support_service.list_user_tickets(session, user.id)
    except Exception as exc:
        _raise_support_error(exc)
    return next(item for item in items if item.id == ticket.id)


@router.get("/tickets/{ticket_id}", response_model=SupportTicketDetail)
async def get_ticket(
    ticket_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketDetail:
    try:
        ticket, messages = await support_service.get_user_ticket(session, user.id, ticket_id)
    except Exception as exc:
        _raise_support_error(exc)
    return _detail(ticket, messages)


@router.post(
    "/tickets/{ticket_id}/messages",
    response_model=SupportMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_message(
    ticket_id: uuid.UUID,
    body: SupportMessageCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportMessageResponse:
    try:
        message = await support_service.add_user_message(session, user, ticket_id, body)
    except Exception as exc:
        _raise_support_error(exc)
    return SupportMessageResponse.model_validate(message)


@router.post("/tickets/{ticket_id}/close", status_code=status.HTTP_204_NO_CONTENT)
async def close_ticket(
    ticket_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        await support_service.close_user_ticket(session, user.id, ticket_id)
    except Exception as exc:
        _raise_support_error(exc)
