"""Validated, access-controlled screenshot storage for support threads."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.support import SupportAttachment, SupportMessage, SupportTicket

MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
MAX_SCREENSHOTS_PER_TICKET = 5
SUPPORTED_SCREENSHOT_TYPES = {"image/jpeg", "image/png", "image/webp"}


class SupportScreenshotError(ValueError):
    pass


def detect_screenshot_mime(data: bytes) -> str | None:
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def read_screenshot(upload) -> tuple[bytes, str]:
    data = await upload.read(MAX_SCREENSHOT_BYTES + 1)
    if not data:
        raise SupportScreenshotError("empty_image")
    if len(data) > MAX_SCREENSHOT_BYTES:
        raise SupportScreenshotError("image_too_large")
    mime_type = detect_screenshot_mime(data)
    declared = str(getattr(upload, "content_type", "") or "").lower()
    if mime_type not in SUPPORTED_SCREENSHOT_TYPES or (
        declared and declared not in SUPPORTED_SCREENSHOT_TYPES
    ):
        raise SupportScreenshotError("unsupported_image")
    return data, mime_type


async def attach_to_latest_user_message(
    session: AsyncSession,
    *,
    ticket_id: uuid.UUID,
    user_id: uuid.UUID,
    idempotency_key: uuid.UUID,
    data: bytes,
    mime_type: str,
) -> SupportAttachment:
    existing = await session.scalar(
        select(SupportAttachment)
        .join(SupportMessage, SupportMessage.id == SupportAttachment.message_id)
        .join(SupportTicket, SupportTicket.id == SupportMessage.ticket_id)
        .where(
            SupportAttachment.idempotency_key == idempotency_key,
            SupportTicket.id == ticket_id,
            SupportTicket.user_id == user_id,
        )
    )
    if existing is not None:
        return existing
    message = await session.scalar(
        select(SupportMessage)
        .join(SupportTicket, SupportTicket.id == SupportMessage.ticket_id)
        .where(
            SupportTicket.id == ticket_id,
            SupportTicket.user_id == user_id,
            SupportTicket.status != "closed",
            SupportMessage.author_type == "user",
        )
        .order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc())
        .limit(1)
    )
    if message is None:
        raise SupportScreenshotError("message_not_found")
    attachment_count = int(
        await session.scalar(
            select(func.count())
            .select_from(SupportAttachment)
            .join(SupportMessage, SupportMessage.id == SupportAttachment.message_id)
            .where(SupportMessage.ticket_id == ticket_id)
        )
        or 0
    )
    if attachment_count >= MAX_SCREENSHOTS_PER_TICKET:
        raise SupportScreenshotError("attachment_limit")
    attachment = SupportAttachment(
        message_id=message.id,
        idempotency_key=idempotency_key,
        mime_type=mime_type,
        size_bytes=len(data),
        image_data=data,
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


async def get_attachment(
    session: AsyncSession,
    attachment_id: uuid.UUID,
) -> tuple[SupportAttachment, uuid.UUID] | None:
    row = (
        await session.execute(
            select(SupportAttachment, SupportTicket.user_id)
            .join(SupportMessage, SupportMessage.id == SupportAttachment.message_id)
            .join(SupportTicket, SupportTicket.id == SupportMessage.ticket_id)
            .where(SupportAttachment.id == attachment_id)
        )
    ).one_or_none()
    return row if row is not None else None
