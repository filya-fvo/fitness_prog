"""ARQ enqueue helper for support reply notifications."""

from __future__ import annotations

import uuid

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import Settings


async def enqueue_support_reply(settings: Settings, message_id: uuid.UUID) -> bool:
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        job = await redis.enqueue_job(
            "send_support_reply_task",
            str(message_id),
            _job_id=f"support-reply-{message_id}",
        )
        return job is not None
    finally:
        await redis.aclose()
