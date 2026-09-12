"""Standards-based browser Web Push delivery."""

from __future__ import annotations

import json
from base64 import urlsafe_b64encode
from asyncio import to_thread
from datetime import UTC, datetime
from functools import lru_cache
from secrets import compare_digest
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from loguru import logger
from py_vapid import Vapid
from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.supplement_intake import WebPushSubscription


def normalized_vapid_private_key(value: str) -> str:
    """Accept a one-line env PEM while keeping secrets out of logs."""

    return value.strip().replace("\\n", "\n")


@lru_cache(maxsize=8)
def parsed_vapid_private_key(value: str) -> Vapid:
    """Parse PEM explicitly; pywebpush otherwise treats a PEM string as raw base64."""

    return Vapid.from_pem(normalized_vapid_private_key(value).encode())


@lru_cache(maxsize=8)
def web_push_configured(public_key: str, private_key: str, subject: str) -> bool:
    """Verify that the configured public key belongs to the private VAPID key."""

    public_key = public_key.strip().rstrip("=")
    private_key = normalized_vapid_private_key(private_key)
    subject = subject.strip()
    if not public_key or not private_key or not subject:
        return False
    try:
        loaded = serialization.load_pem_private_key(private_key.encode(), password=None)
        if not isinstance(loaded, ec.EllipticCurvePrivateKey):
            return False
        derived = urlsafe_b64encode(
            loaded.public_key().public_bytes(
                serialization.Encoding.X962,
                serialization.PublicFormat.UncompressedPoint,
            )
        ).rstrip(b"=").decode()
    except (TypeError, ValueError):
        return False
    return compare_digest(public_key, derived)


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
    if not web_push_configured(
        settings.web_push_vapid_public_key,
        settings.web_push_vapid_private_key,
        settings.web_push_vapid_subject,
    ):
        logger.error("web_push_configuration_invalid")
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
                vapid_private_key=parsed_vapid_private_key(
                    settings.web_push_vapid_private_key
                ),
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
            # An unexpected local/configuration failure says nothing about the
            # browser endpoint. Do not permanently disable a valid subscription.
            logger.warning("web_push_failed subscription={} err={}", subscription.id, exc)
    await session.commit()
    return sent
