"""Rate-limited, restart-safe delivery batches for administrator broadcasts."""

from __future__ import annotations

import asyncio
import html
import uuid
from datetime import UTC, datetime
from typing import Any

from loguru import logger
from sqlalchemy import func, select, update

from app.core.database import AsyncSessionLocal
from app.models.admin_broadcast import AdminBroadcast, AdminBroadcastDelivery
from app.services import admin_audit
from app.services.telegram_bot import TelegramBotError, send_app_notification

BATCH_SIZE = 20
SEND_INTERVAL_SECONDS = 0.06


def classify_telegram_error(error: TelegramBotError) -> tuple[str, str]:
    """Blocked/deleted chats are terminal skips; transport/API failures stay retryable."""
    message = str(error).lower()
    if any(
        marker in message
        for marker in ("bot was blocked", "chat not found", "user is deactivated", "forbidden")
    ):
        return "skipped", "telegram_unavailable"
    if "transport error" in message or "timeout" in message:
        return "failed", "telegram_transport"
    return "failed", "telegram_api"


async def _claim_batch(campaign_id: uuid.UUID) -> tuple[AdminBroadcast | None, list[AdminBroadcastDelivery]]:
    async with AsyncSessionLocal() as session:
        campaign = await session.scalar(
            select(AdminBroadcast).where(AdminBroadcast.id == campaign_id).with_for_update()
        )
        if campaign is None or campaign.status not in {"scheduled", "sending"}:
            return None, []
        now = datetime.now(UTC)
        if campaign.scheduled_at is not None and campaign.scheduled_at > now:
            return campaign, []
        await session.execute(
            update(AdminBroadcastDelivery)
            .where(
                AdminBroadcastDelivery.broadcast_id == campaign_id,
                AdminBroadcastDelivery.status == "sending",
            )
            .values(status="pending", error_code="worker_recovered")
        )
        deliveries = list(
            (
                await session.scalars(
                    select(AdminBroadcastDelivery)
                    .where(
                        AdminBroadcastDelivery.broadcast_id == campaign_id,
                        AdminBroadcastDelivery.status == "pending",
                    )
                    .order_by(AdminBroadcastDelivery.created_at.asc(), AdminBroadcastDelivery.id.asc())
                    .limit(BATCH_SIZE)
                    .with_for_update(skip_locked=True)
                )
            ).all()
        )
        campaign.status = "sending"
        campaign.started_at = campaign.started_at or now
        for delivery in deliveries:
            delivery.status = "sending"
            delivery.attempts += 1
            delivery.error_code = None
        await session.commit()
        return campaign, deliveries


async def _save_result(delivery_id: uuid.UUID, status_value: str, error_code: str | None) -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(AdminBroadcastDelivery)
            .where(AdminBroadcastDelivery.id == delivery_id)
            .values(
                status=status_value,
                error_code=error_code,
                sent_at=datetime.now(UTC) if status_value == "sent" else None,
            )
        )
        await session.commit()


async def _finish_or_continue(campaign_id: uuid.UUID) -> tuple[bool, dict[str, int], int]:
    async with AsyncSessionLocal() as session:
        campaign = await session.scalar(
            select(AdminBroadcast).where(AdminBroadcast.id == campaign_id).with_for_update()
        )
        if campaign is None:
            return True, {}, 0
        rows = (
            await session.execute(
                select(AdminBroadcastDelivery.status, func.count())
                .where(AdminBroadcastDelivery.broadcast_id == campaign_id)
                .group_by(AdminBroadcastDelivery.status)
            )
        ).all()
        counts = {str(key): int(value) for key, value in rows}
        remaining = counts.get("pending", 0) + counts.get("sending", 0)
        if remaining:
            return False, counts, campaign.retry_count
        campaign.status = "completed"
        campaign.completed_at = datetime.now(UTC)
        context = admin_audit.AuditContext(campaign.actor_user_id, campaign.correlation_id)
        admin_audit.add_event(
            session,
            context=context,
            action="broadcast.complete",
            object_type="broadcast",
            object_id=campaign.id,
            result="success",
            description="Рассылка завершена; итоговые счётчики сохранены.",
            after={
                "expected": campaign.audience_count,
                "sent": counts.get("sent", 0),
                "failed": counts.get("failed", 0),
                "skipped": counts.get("skipped", 0),
                "status": "completed",
            },
            notification_status="failed" if counts.get("failed", 0) else "sent",
        )
        await session.commit()
        return True, counts, campaign.retry_count


async def deliver_batch(ctx: dict[str, Any], campaign_id: uuid.UUID) -> dict[str, Any]:
    redis = ctx.get("redis")
    lock_key = f"fitness:broadcast:lock:{campaign_id}"
    lock_token = uuid.uuid4().hex
    if redis is not None and not await redis.set(lock_key, lock_token, nx=True, ex=900):
        return {"ok": True, "skipped": "already_running"}
    try:
        campaign, deliveries = await _claim_batch(campaign_id)
        if campaign is None:
            return {"ok": True, "skipped": "not_dispatchable"}
        if not deliveries:
            if campaign.scheduled_at is not None and campaign.scheduled_at > datetime.now(UTC):
                return {"ok": True, "skipped": "not_due"}
            complete, counts, _retry_count = await _finish_or_continue(campaign.id)
            return {"ok": True, "complete": complete, **counts}
        settings = ctx["settings"]
        for index, delivery in enumerate(deliveries):
            try:
                await send_app_notification(
                    settings,
                    telegram_id=delivery.telegram_id,
                    title=html.escape(campaign.title),
                    text=html.escape(campaign.message_text),
                    startapp="home",
                )
                await _save_result(delivery.id, "sent", None)
            except TelegramBotError as exc:
                delivery_status, code = classify_telegram_error(exc)
                logger.warning(
                    "broadcast_delivery_failed campaign={} user={} code={}",
                    campaign.id,
                    delivery.user_id,
                    code,
                )
                await _save_result(delivery.id, delivery_status, code)
            if index + 1 < len(deliveries):
                await asyncio.sleep(SEND_INTERVAL_SECONDS)
        complete, counts, retry_count = await _finish_or_continue(campaign.id)
        if not complete and redis is not None:
            await redis.enqueue_job(
                "send_broadcast_batch_task",
                str(campaign.id),
                _job_id=f"broadcast:{campaign.id}:{retry_count}:{uuid.uuid4().hex}",
                _defer_by=1,
            )
        return {"ok": True, "complete": complete, **counts}
    finally:
        if redis is not None:
            await redis.eval(
                "if redis.call('get', KEYS[1]) == ARGV[1] then "
                "return redis.call('del', KEYS[1]) else return 0 end",
                1,
                lock_key,
                lock_token,
            )
