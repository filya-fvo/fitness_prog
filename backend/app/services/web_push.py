"""Standards-based browser Web Push delivery."""

from __future__ import annotations

import json
from asyncio import to_thread
from datetime import UTC, datetime
from typing import Any

from loguru import logger
from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.supplement_intake import WebPushSubscription


async def send_user_web_push(
    session: AsyncSession,
    settings: Settings,
    *,
    user_id: Any,
    title: str,
    body: str,
    url: str,
    tag: str,
) -> int:
    if not settings.web_push_vapid_private_key or not settings.web_push_vapid_subject:
        return 0
    subscriptions = list(
        await session.scalars(
            select(WebPushSubscription).where(
                WebPushSubscription.user_id == user_id,
                WebPushSubscription.disabled_at.is_(None),
                WebPushSubscription.is_deleted.is_(False),
            )
        )
    )
    sent = 0
    payload = json.dumps(
        {"title": title, "body": body, "url": url, "tag": tag}, ensure_ascii=False
    )
    for subscription in subscriptions:
        try:
            await to_thread(
                webpush,
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=settings.web_push_vapid_private_key.replace("\\n", "\n"),
                vapid_claims={"sub": settings.web_push_vapid_subject},
                ttl=3600,
            )
            subscription.last_success_at = datetime.now(UTC)
            subscription.failure_count = 0
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            subscription.failure_count += 1
            if status in {404, 410} or subscription.failure_count >= 5:
                subscription.disabled_at = datetime.now(UTC)
            logger.warning(
                "web_push_failed subscription={} status={} failures={}",
                subscription.id,
                status,
                subscription.failure_count,
            )
        except Exception as exc:  # noqa: BLE001 — one bad device must not stop dispatch
            subscription.failure_count += 1
            logger.warning("web_push_failed subscription={} err={}", subscription.id, exc)
    await session.commit()
    return sent
