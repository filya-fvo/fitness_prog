"""Per-user AI rate limiter with Redis and a development-only memory fallback."""

from __future__ import annotations

import time
from collections import defaultdict

from app.core.config import Settings

DEFAULT_DAILY_LIMIT = 10

# process-local fallback: user_id -> (window_start_ts, count)
_memory_buckets: dict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))


class RateLimitExceeded(Exception):
    def __init__(self, remaining: int = 0) -> None:
        self.remaining = remaining
        super().__init__("AI daily limit exceeded")


class RateLimitBackendUnavailable(RuntimeError):
    """Raised in production when the shared Redis quota cannot be enforced."""


async def consume_ai_quota(user_id: str, settings: Settings) -> int:
    """Consume 1 request. Returns remaining after consume. Raises RateLimitExceeded."""
    daily_limit = max(1, settings.ai_daily_limit)
    # Try Redis
    try:
        import redis.asyncio as redis  # type: ignore

        client = redis.from_url(settings.redis_url, decode_responses=True)
        key = f"ai:quota:{user_id}:{time.strftime('%Y%m%d')}"
        try:
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, 60 * 60 * 36)
            remaining = max(0, daily_limit - int(count))
            if int(count) > daily_limit:
                raise RateLimitExceeded(remaining=0)
            return remaining
        finally:
            await client.aclose()
    except RateLimitExceeded:
        raise
    except Exception as exc:
        if settings.environment == "production":
            raise RateLimitBackendUnavailable("Redis rate limiter unavailable") from exc
        # Process-local fallback is acceptable only for development/test.
        day = time.strftime("%Y%m%d")
        mem_key = f"{user_id}:{day}"
        start, count = _memory_buckets[mem_key]
        now = time.time()
        if start == 0.0:
            _memory_buckets[mem_key] = (now, 1)
            return daily_limit - 1
        count += 1
        _memory_buckets[mem_key] = (start, count)
        if count > daily_limit:
            raise RateLimitExceeded(remaining=0)
        return daily_limit - count
