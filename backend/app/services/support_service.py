"""Durable support ticket lifecycle shared by user and administrator routes."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.support import SupportMessage, SupportTicket
from app.models.user import User
from app.schemas.support import (
    AdminSupportTicketSummary,
    SupportMessageCreate,
    SupportTicketCreate,
    SupportTicketSummary,
)
from app.services import admin_audit

SUPPORT_MESSAGES_PER_HOUR = 12


class SupportTicketNotFoundError(RuntimeError):
    pass


class SupportTicketClosedError(RuntimeError):
    pass


class SupportRateLimitError(RuntimeError):
    pass


def _subject(message: str) -> str:
    first_line = " ".join(message.strip().splitlines()[0].split())
    return first_line[:120] or "Обращение в поддержку"


def _preview(message: str) -> str:
    return " ".join(message.split())[:180]


def user_label(user: User) -> str:
    if user.username:
        return f"@{user.username.lstrip('@')}"
    if user.auth_email:
        return user.auth_email
    return f"Пользователь {str(user.id)[:8]}"


async def _ensure_rate_limit(session: AsyncSession, user_id: uuid.UUID) -> None:
    since = datetime.now(UTC) - timedelta(hours=1)
    count = int(
        await session.scalar(
            select(func.count())
            .select_from(SupportMessage)
            .join(SupportTicket, SupportTicket.id == SupportMessage.ticket_id)
            .where(
                SupportTicket.user_id == user_id,
                SupportMessage.author_type == "user",
                SupportMessage.created_at >= since,
            )
        )
        or 0
    )
    if count >= SUPPORT_MESSAGES_PER_HOUR:
        raise SupportRateLimitError("Support message quota exceeded")


async def create_ticket(
    session: AsyncSession,
    user: User,
    data: SupportTicketCreate,
) -> SupportTicket:
    existing = await session.scalar(
        select(SupportTicket).where(
            SupportTicket.user_id == user.id,
            SupportTicket.idempotency_key == data.idempotency_key,
        )
    )
    if existing is not None:
        return existing
    await _ensure_rate_limit(session, user.id)
    now = datetime.now(UTC)
    ticket = SupportTicket(
        user_id=user.id,
        category=data.category,
        status="waiting_support",
        subject=_subject(data.message),
        source_page=data.page.strip() or None,
        client=data.client,
        app_version=data.app_version.strip() or None,
        idempotency_key=data.idempotency_key,
        last_message_at=now,
        user_last_read_at=now,
    )
    message = SupportMessage(
        ticket_id=ticket.id,
        author_type="user",
        author_user_id=user.id,
        body=data.message.strip(),
        idempotency_key=data.idempotency_key,
        delivery_channel="in_app",
        delivery_status="not_requested",
        created_at=now,
        attachments=[],
    )
    session.add(ticket)
    await session.flush()
    message.ticket_id = ticket.id
    session.add(message)
    await session.commit()
    await session.refresh(ticket)
    return ticket


async def add_user_message(
    session: AsyncSession,
    user: User,
    ticket_id: uuid.UUID,
    data: SupportMessageCreate,
) -> SupportMessage:
    existing = await session.scalar(
        select(SupportMessage)
        .join(SupportTicket, SupportTicket.id == SupportMessage.ticket_id)
        .where(
            SupportMessage.idempotency_key == data.idempotency_key,
            SupportTicket.user_id == user.id,
        )
    )
    if existing is not None:
        return existing
    ticket = await session.scalar(
        select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.user_id == user.id)
    )
    if ticket is None:
        raise SupportTicketNotFoundError
    if ticket.status == "closed":
        raise SupportTicketClosedError
    await _ensure_rate_limit(session, user.id)
    now = datetime.now(UTC)
    message = SupportMessage(
        ticket_id=ticket.id,
        author_type="user",
        author_user_id=user.id,
        body=data.message.strip(),
        idempotency_key=data.idempotency_key,
        delivery_channel="in_app",
        delivery_status="not_requested",
        created_at=now,
        attachments=[],
    )
    ticket.status = "waiting_support"
    ticket.last_message_at = now
    ticket.user_last_read_at = now
    ticket.closed_at = None
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message


def _latest_message_queries():
    latest_body = (
        select(SupportMessage.body)
        .where(SupportMessage.ticket_id == SupportTicket.id)
        .order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc())
        .limit(1)
        .scalar_subquery()
    )
    latest_author = (
        select(SupportMessage.author_type)
        .where(SupportMessage.ticket_id == SupportTicket.id)
        .order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc())
        .limit(1)
        .scalar_subquery()
    )
    return latest_body, latest_author


def _summary(ticket: SupportTicket, body: str | None, author: str | None, *, admin: bool):
    read_at = ticket.admin_last_read_at if admin else ticket.user_last_read_at
    unread_author = "user" if admin else "admin"
    return {
        "id": ticket.id,
        "category": ticket.category,
        "status": ticket.status,
        "subject": ticket.subject,
        "last_message_preview": _preview(body or ""),
        "unread": author == unread_author and (read_at is None or ticket.last_message_at > read_at),
        "last_message_at": ticket.last_message_at,
        "created_at": ticket.created_at,
    }


async def list_user_tickets(session: AsyncSession, user_id: uuid.UUID) -> list[SupportTicketSummary]:
    latest_body, latest_author = _latest_message_queries()
    rows = (
        await session.execute(
            select(SupportTicket, latest_body, latest_author)
            .where(SupportTicket.user_id == user_id)
            .order_by(SupportTicket.last_message_at.desc(), SupportTicket.id.desc())
            .limit(100)
        )
    ).all()
    return [SupportTicketSummary.model_validate(_summary(ticket, body, author, admin=False)) for ticket, body, author in rows]


async def get_user_ticket(
    session: AsyncSession,
    user_id: uuid.UUID,
    ticket_id: uuid.UUID,
) -> tuple[SupportTicket, list[SupportMessage]]:
    ticket = await session.scalar(
        select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.user_id == user_id)
    )
    if ticket is None:
        raise SupportTicketNotFoundError
    messages = list(
        (
            await session.scalars(
                select(SupportMessage)
                .where(SupportMessage.ticket_id == ticket.id)
                .order_by(SupportMessage.created_at.asc(), SupportMessage.id.asc())
            )
        ).all()
    )
    ticket.user_last_read_at = datetime.now(UTC)
    await session.commit()
    return ticket, messages


async def close_user_ticket(session: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID) -> None:
    ticket = await session.scalar(
        select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.user_id == user_id)
    )
    if ticket is None:
        raise SupportTicketNotFoundError
    ticket.status = "closed"
    ticket.closed_at = datetime.now(UTC)
    await session.commit()


async def list_admin_tickets(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    status: str | None,
    category: str | None,
) -> tuple[list[AdminSupportTicketSummary], int, int]:
    filters = []
    if status:
        filters.append(SupportTicket.status == status)
    if category:
        filters.append(SupportTicket.category == category)
    total = int(await session.scalar(select(func.count()).select_from(SupportTicket).where(*filters)) or 0)
    waiting = int(
        await session.scalar(
            select(func.count()).select_from(SupportTicket).where(SupportTicket.status == "waiting_support")
        )
        or 0
    )
    latest_body, latest_author = _latest_message_queries()
    rows = (
        await session.execute(
            select(SupportTicket, User, latest_body, latest_author)
            .join(User, User.id == SupportTicket.user_id)
            .where(*filters)
            .order_by(SupportTicket.last_message_at.desc(), SupportTicket.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        AdminSupportTicketSummary.model_validate(
            {**_summary(ticket, body, author, admin=True), "user_id": user.id, "user_label": user_label(user)}
        )
        for ticket, user, body, author in rows
    ]
    return items, total, waiting


async def get_admin_ticket(
    session: AsyncSession,
    ticket_id: uuid.UUID,
) -> tuple[SupportTicket, User, list[SupportMessage]]:
    row = (
        await session.execute(
            select(SupportTicket, User)
            .join(User, User.id == SupportTicket.user_id)
            .where(SupportTicket.id == ticket_id)
        )
    ).one_or_none()
    if row is None:
        raise SupportTicketNotFoundError
    ticket, user = row
    messages = list(
        (
            await session.scalars(
                select(SupportMessage)
                .where(SupportMessage.ticket_id == ticket.id)
                .order_by(SupportMessage.created_at.asc(), SupportMessage.id.asc())
            )
        ).all()
    )
    ticket.admin_last_read_at = datetime.now(UTC)
    await session.commit()
    return ticket, user, messages


async def add_admin_reply(
    session: AsyncSession,
    admin: User,
    ticket_id: uuid.UUID,
    data: SupportMessageCreate,
    *,
    audit_context: admin_audit.AuditContext,
) -> tuple[SupportMessage, User]:
    existing = await session.scalar(
        select(SupportMessage).where(
            SupportMessage.idempotency_key == data.idempotency_key,
            SupportMessage.ticket_id == ticket_id,
            SupportMessage.author_type == "admin",
        )
    )
    if existing is not None:
        user = await session.scalar(
            select(User).join(SupportTicket, SupportTicket.user_id == User.id).where(SupportTicket.id == ticket_id)
        )
        if user is None:
            raise SupportTicketNotFoundError
        return existing, user
    ticket, user, _messages = await get_admin_ticket(session, ticket_id)
    if ticket.status == "closed":
        raise SupportTicketClosedError
    now = datetime.now(UTC)
    can_telegram = user.telegram_id is not None
    message = SupportMessage(
        ticket_id=ticket.id,
        author_type="admin",
        author_user_id=admin.id,
        body=data.message.strip(),
        idempotency_key=data.idempotency_key,
        delivery_channel="telegram" if can_telegram else "in_app",
        delivery_status="pending" if can_telegram else "unavailable",
        created_at=now,
        attachments=[],
    )
    ticket.status = "waiting_user"
    ticket.last_message_at = now
    ticket.admin_last_read_at = now
    ticket.closed_at = None
    session.add(message)
    await session.flush()
    admin_audit.add_event(
        session,
        context=audit_context,
        action="support.reply",
        object_type="support_ticket",
        object_id=ticket.id,
        result="success",
        description="Поддержка ответила на обращение.",
        after={"status": "waiting_user", "delivery": message.delivery_status},
        notification_status=message.delivery_status,
    )
    await session.commit()
    await session.refresh(message)
    return message, user


async def update_admin_status(
    session: AsyncSession,
    ticket_id: uuid.UUID,
    status: str,
    *,
    audit_context: admin_audit.AuditContext,
) -> SupportTicket:
    ticket = await session.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise SupportTicketNotFoundError
    before = ticket.status
    ticket.status = status
    ticket.closed_at = datetime.now(UTC) if status == "closed" else None
    admin_audit.add_event(
        session,
        context=audit_context,
        action="support.status",
        object_type="support_ticket",
        object_id=ticket.id,
        result="success",
        description="Статус обращения изменён.",
        before={"status": before},
        after={"status": status},
    )
    await session.commit()
    await session.refresh(ticket)
    return ticket
