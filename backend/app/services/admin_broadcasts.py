"""Business rules for safe administrator Telegram broadcasts."""

from __future__ import annotations

import hashlib
import html
import json
import uuid
from datetime import UTC, datetime

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.admin_broadcast import AdminBroadcast, AdminBroadcastDelivery
from app.models.user import User
from app.schemas.admin_broadcast import (
    AdminBroadcastAudience,
    AdminBroadcastCounts,
    AdminBroadcastDraftRequest,
    AdminBroadcastFailureReason,
    AdminBroadcastListResponse,
    AdminBroadcastResponse,
    AdminBroadcastUpdateRequest,
)
from app.services import admin_audit
from app.services.admin_broadcast_audience import audience_count, audience_recipients
from app.services.telegram_bot import TelegramBotError, send_app_notification

_VISIBLE_FAILURE_CODES = {
    "telegram_unavailable",
    "telegram_transport",
    "telegram_api",
    "worker_recovered",
}


def _clean_title(value: str) -> str:
    return " ".join(value.split()).strip()


def _clean_message(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def _content_hash(title: str, message: str, audience: AdminBroadcastAudience) -> str:
    payload = json.dumps(
        {"title": title, "message": message, "audience": audience.model_dump(mode="json")},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _audit_snapshot(campaign: AdminBroadcast, counts: AdminBroadcastCounts) -> dict[str, object]:
    return {
        "audience": str(campaign.audience.get("kind") or "all_telegram")[:40],
        "expected": counts.expected,
        "pending": counts.pending + counts.sending,
        "sent": counts.sent,
        "failed": counts.failed,
        "skipped": counts.skipped,
        "cancelled": counts.cancelled,
        "status": campaign.status,
        "scheduled": campaign.scheduled_at is not None,
        "timezone": campaign.scheduled_timezone,
    }


async def _get(session: AsyncSession, campaign_id: uuid.UUID, *, lock: bool = False) -> AdminBroadcast:
    statement = select(AdminBroadcast).where(AdminBroadcast.id == campaign_id)
    if lock:
        statement = statement.with_for_update()
    campaign = await session.scalar(statement)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Рассылка не найдена")
    return campaign


async def _delivery_summary(
    session: AsyncSession, campaign: AdminBroadcast
) -> tuple[AdminBroadcastCounts, list[AdminBroadcastFailureReason]]:
    rows = (
        await session.execute(
            select(
                AdminBroadcastDelivery.status,
                AdminBroadcastDelivery.error_code,
                func.count(),
            )
            .where(AdminBroadcastDelivery.broadcast_id == campaign.id)
            .group_by(AdminBroadcastDelivery.status, AdminBroadcastDelivery.error_code)
            .order_by(AdminBroadcastDelivery.status, AdminBroadcastDelivery.error_code)
        )
    ).all()
    values: dict[str, int] = {}
    for status_value, _error_code, count in rows:
        key = str(status_value)
        values[key] = values.get(key, 0) + int(count)
    reasons = [
        AdminBroadcastFailureReason(
            status=status_value,
            code=error_code if error_code in _VISIBLE_FAILURE_CODES else "unknown",
            count=int(count),
        )
        for status_value, error_code, count in rows
        if status_value in {"failed", "skipped"}
    ]
    return AdminBroadcastCounts(expected=campaign.audience_count, **values), reasons


async def _counts(session: AsyncSession, campaign: AdminBroadcast) -> AdminBroadcastCounts:
    counts, _reasons = await _delivery_summary(session, campaign)
    return counts


async def _response(session: AsyncSession, campaign: AdminBroadcast) -> AdminBroadcastResponse:
    counts, failure_reasons = await _delivery_summary(session, campaign)
    return AdminBroadcastResponse(
        id=campaign.id,
        actor_user_id=campaign.actor_user_id,
        title=campaign.title,
        message_text=campaign.message_text,
        audience=AdminBroadcastAudience.model_validate(campaign.audience),
        status=campaign.status,
        counts=counts,
        failure_reasons=failure_reasons,
        tested_at=campaign.tested_at,
        scheduled_at=campaign.scheduled_at,
        scheduled_timezone=campaign.scheduled_timezone,
        started_at=campaign.started_at,
        completed_at=campaign.completed_at,
        cancelled_at=campaign.cancelled_at,
        retry_count=campaign.retry_count,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )


async def create_draft(
    session: AsyncSession,
    body: AdminBroadcastDraftRequest,
    *,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    title, message = _clean_title(body.title), _clean_message(body.message_text)
    digest = _content_hash(title, message, body.audience)
    existing = await session.scalar(
        select(AdminBroadcast).where(AdminBroadcast.idempotency_key == body.idempotency_key)
    )
    if existing is not None:
        if existing.actor_user_id != context.actor_user_id or existing.content_hash != digest:
            raise HTTPException(status_code=409, detail="Ключ запроса уже использован")
        return await _response(session, existing)
    expected = await audience_count(session, body.audience)
    campaign = AdminBroadcast(
        actor_user_id=context.actor_user_id,
        title=title,
        message_text=message,
        audience=body.audience.model_dump(mode="json", exclude_none=True),
        audience_count=expected,
        status="draft",
        content_hash=digest,
        idempotency_key=body.idempotency_key,
        correlation_id=context.correlation_id,
    )
    session.add(campaign)
    await session.flush()
    counts = AdminBroadcastCounts(expected=expected)
    admin_audit.add_event(
        session,
        context=context,
        action="broadcast.create",
        object_type="broadcast",
        object_id=campaign.id,
        result="success",
        description="Создан черновик рассылки.",
        after=_audit_snapshot(campaign, counts),
    )
    await session.commit()
    await session.refresh(campaign)
    return await _response(session, campaign)


async def update_draft(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    body: AdminBroadcastUpdateRequest,
    *,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    campaign = await _get(session, campaign_id, lock=True)
    if campaign.status not in {"draft", "tested"}:
        raise HTTPException(status_code=409, detail="Запущенную рассылку нельзя редактировать")
    title, message = _clean_title(body.title), _clean_message(body.message_text)
    campaign.title = title
    campaign.message_text = message
    campaign.audience = body.audience.model_dump(mode="json", exclude_none=True)
    campaign.audience_count = await audience_count(session, body.audience)
    campaign.content_hash = _content_hash(title, message, body.audience)
    campaign.status = "draft"
    campaign.tested_at = None
    admin_audit.add_event(
        session,
        context=context,
        action="broadcast.update",
        object_type="broadcast",
        object_id=campaign.id,
        result="success",
        description="Черновик рассылки изменён; тестовая отправка сброшена.",
        after=_audit_snapshot(campaign, AdminBroadcastCounts(expected=campaign.audience_count)),
    )
    await session.commit()
    await session.refresh(campaign)
    return await _response(session, campaign)


async def test_delivery(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    *,
    admin: User,
    settings: Settings,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    campaign = await _get(session, campaign_id, lock=True)
    if campaign.status not in {"draft", "tested"}:
        raise HTTPException(status_code=409, detail="Рассылка уже запущена")
    if admin.telegram_id is None:
        raise HTTPException(status_code=409, detail="У администратора не подключён Telegram")
    try:
        await send_broadcast_test_message(
            settings,
            telegram_id=int(admin.telegram_id),
            title=campaign.title,
            message=campaign.message_text,
        )
    except TelegramBotError as exc:
        raise HTTPException(status_code=502, detail="Тестовое сообщение не доставлено") from exc
    campaign.status = "tested"
    campaign.tested_at = datetime.now(UTC)
    counts = AdminBroadcastCounts(expected=campaign.audience_count)
    admin_audit.add_event(
        session,
        context=context,
        action="broadcast.test",
        object_type="broadcast",
        object_id=campaign.id,
        result="success",
        description="Тестовое сообщение доставлено администратору.",
        after=_audit_snapshot(campaign, counts),
        notification_status="sent",
    )
    await session.commit()
    await session.refresh(campaign)
    return await _response(session, campaign)


async def launch(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    *,
    expected_count: int,
    confirmation_text: str,
    confirmed: bool,
    scheduled_at: datetime | None,
    scheduled_timezone: str,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    campaign = await _get(session, campaign_id, lock=True)
    if campaign.status != "tested" or campaign.tested_at is None:
        raise HTTPException(status_code=409, detail="Сначала отправьте тест администратору")
    audience = AdminBroadcastAudience.model_validate(campaign.audience)
    recipients = await audience_recipients(session, audience)
    count = len(recipients)
    if count != expected_count:
        raise HTTPException(status_code=409, detail="Аудитория изменилась. Обновите количество")
    required = f"РАЗОСЛАТЬ {count}"
    if not confirmed or confirmation_text.strip() != required:
        raise HTTPException(status_code=400, detail=f"Введите «{required}»")
    if count == 0:
        raise HTTPException(status_code=409, detail="В выбранной аудитории нет получателей")
    session.add_all(
        [
            AdminBroadcastDelivery(
                broadcast_id=campaign.id, user_id=user_id, telegram_id=telegram_id
            )
            for user_id, telegram_id in recipients
        ]
    )
    campaign.audience_count = count
    campaign.scheduled_at = scheduled_at or datetime.now(UTC)
    campaign.scheduled_timezone = scheduled_timezone
    campaign.status = "scheduled"
    campaign.correlation_id = context.correlation_id
    counts = AdminBroadcastCounts(expected=count, pending=count)
    admin_audit.add_event(
        session,
        context=context,
        action="broadcast.launch",
        object_type="broadcast",
        object_id=campaign.id,
        result="success",
        description="Рассылка подтверждена и поставлена в очередь.",
        after=_audit_snapshot(campaign, counts),
        notification_status="pending",
    )
    await session.commit()
    await session.refresh(campaign)
    return await _response(session, campaign)


async def cancel_scheduled(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    *,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    campaign = await _get(session, campaign_id, lock=True)
    if campaign.status != "scheduled" or campaign.started_at is not None:
        raise HTTPException(
            status_code=409,
            detail="Можно отменить только запланированную рассылку до начала отправки",
        )
    before_counts = await _counts(session, campaign)
    await session.execute(
        update(AdminBroadcastDelivery)
        .where(
            AdminBroadcastDelivery.broadcast_id == campaign.id,
            AdminBroadcastDelivery.status == "pending",
        )
        .values(status="cancelled", error_code="admin_cancelled")
    )
    campaign.status = "cancelled"
    campaign.cancelled_at = datetime.now(UTC)
    campaign.correlation_id = context.correlation_id
    after_counts = AdminBroadcastCounts(
        expected=before_counts.expected,
        sent=before_counts.sent,
        failed=before_counts.failed,
        skipped=before_counts.skipped,
        cancelled=before_counts.pending,
    )
    admin_audit.add_event(
        session,
        context=context,
        action="broadcast.cancel",
        object_type="broadcast",
        object_id=campaign.id,
        result="success",
        description="Запланированная рассылка отменена до начала отправки.",
        before=_audit_snapshot(campaign, before_counts) | {"status": "scheduled"},
        after=_audit_snapshot(campaign, after_counts),
        notification_status="not_requested",
    )
    await session.commit()
    await session.refresh(campaign)
    return await _response(session, campaign)


async def retry_failed(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    *,
    confirmed: bool,
    confirmation_text: str,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    campaign = await _get(session, campaign_id, lock=True)
    if campaign.status != "completed":
        raise HTTPException(status_code=409, detail="Рассылка ещё не завершена")
    failed = int(
        await session.scalar(
            select(func.count()).select_from(AdminBroadcastDelivery).where(
                AdminBroadcastDelivery.broadcast_id == campaign.id,
                AdminBroadcastDelivery.status == "failed",
            )
        )
        or 0
    )
    required = f"ПОВТОРИТЬ {failed}"
    if failed == 0:
        raise HTTPException(status_code=409, detail="Неуспешных отправок нет")
    if not confirmed or confirmation_text.strip() != required:
        raise HTTPException(status_code=400, detail=f"Введите «{required}»")
    await session.execute(
        update(AdminBroadcastDelivery)
        .where(
            AdminBroadcastDelivery.broadcast_id == campaign.id,
            AdminBroadcastDelivery.status == "failed",
        )
        .values(status="pending", error_code=None)
    )
    campaign.status = "scheduled"
    campaign.scheduled_at = datetime.now(UTC)
    campaign.completed_at = None
    campaign.retry_count += 1
    campaign.correlation_id = context.correlation_id
    admin_audit.add_event(
        session,
        context=context,
        action="broadcast.retry",
        object_type="broadcast",
        object_id=campaign.id,
        result="success",
        description="Неуспешные отправки повторно поставлены в очередь.",
        after={"failed": failed, "status": "scheduled", "scheduled": True},
        notification_status="pending",
    )
    await session.commit()
    await session.refresh(campaign)
    return await _response(session, campaign)


async def copy_as_draft(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    *,
    idempotency_key: uuid.UUID,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    source = await _get(session, campaign_id)
    body = AdminBroadcastDraftRequest(
        title=f"Копия: {source.title}"[:80],
        message_text=source.message_text,
        audience=AdminBroadcastAudience.model_validate(source.audience),
        idempotency_key=idempotency_key,
    )
    return await create_draft(session, body, context=context)


async def list_campaigns(
    session: AsyncSession, *, limit: int = 20, offset: int = 0
) -> AdminBroadcastListResponse:
    limit, offset = max(1, min(50, limit)), max(0, offset)
    total = int(await session.scalar(select(func.count()).select_from(AdminBroadcast)) or 0)
    campaigns = list(
        (
            await session.scalars(
                select(AdminBroadcast)
                .order_by(AdminBroadcast.created_at.desc(), AdminBroadcast.id.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return AdminBroadcastListResponse(
        items=[await _response(session, item) for item in campaigns],
        total=total,
        limit=limit,
        offset=offset,
    )


async def get_campaign(session: AsyncSession, campaign_id: uuid.UUID) -> AdminBroadcastResponse:
    return await _response(session, await _get(session, campaign_id))


async def record_resume(
    session: AsyncSession,
    campaign_id: uuid.UUID,
    *,
    context: admin_audit.AuditContext,
) -> AdminBroadcastResponse:
    campaign = await _get(session, campaign_id, lock=True)
    if campaign.status != "scheduled":
        raise HTTPException(status_code=409, detail="Рассылка не ожидает постановки в очередь")
    admin_audit.add_event(
        session,
        context=context,
        action="broadcast.resume",
        object_type="broadcast",
        object_id=campaign.id,
        result="success",
        description="Повторно запрошена постановка сохранённой рассылки в очередь.",
        after={"status": "scheduled", "scheduled": True, "expected": campaign.audience_count},
        notification_status="pending",
    )
    await session.commit()
    await session.refresh(campaign)
    return await _response(session, campaign)


async def enqueue_campaign(settings: Settings, campaign: AdminBroadcastResponse) -> None:
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        await redis.enqueue_job(
            "send_broadcast_batch_task",
            str(campaign.id),
            _job_id=f"broadcast:{campaign.id}:{campaign.retry_count}",
            _defer_until=campaign.scheduled_at,
        )
    finally:
        await redis.close()


async def send_broadcast_test_message(
    settings: Settings,
    *,
    telegram_id: int,
    title: str,
    message: str,
) -> None:
    """Send one broadcast-formatted message without resolving a mass audience."""
    await send_app_notification(
        settings,
        telegram_id=telegram_id,
        title=html.escape(title),
        text=html.escape(message),
        startapp="home",
    )


async def revert_failed_enqueue(session: AsyncSession, campaign_id: uuid.UUID) -> None:
    campaign = await _get(session, campaign_id, lock=True)
    if campaign.status != "scheduled":
        return
    await session.execute(
        delete(AdminBroadcastDelivery).where(
            AdminBroadcastDelivery.broadcast_id == campaign.id,
            AdminBroadcastDelivery.status == "pending",
            AdminBroadcastDelivery.attempts == 0,
        )
    )
    campaign.status = "tested"
    campaign.scheduled_at = None
    await session.commit()
