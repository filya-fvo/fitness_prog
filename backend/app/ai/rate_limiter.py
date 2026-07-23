"""AI rate limiter: Redis token bucket with in-memory fallback (15/day)."""

from __future__ import annotations

import time
from collections import defaultdict

from app.core.config import Settings

DAILY_LIMIT = 15

# process-local fallback: user_id -> (window_start_ts, count)
_memory_buckets: dict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))


class RateLimitExceeded(Exception):
    def __init__(self, remaining: int = 0) -> None:
        self.remaining = remaining
        super().__init__("AI daily limit exceeded")


async def consume_ai_quota(user_id: str, settings: Settings) -> int:
    """Consume 1 request. Returns remaining after consume. Raises RateLimitExceeded."""
    # Try Redis
    try:
        import redis.asyncio as redis  # type: ignore

        client = redis.from_url(settings.redis_url, decode_responses=True)
        key = f"ai:quota:{user_id}:{time.strftime('%Y%m%d')}"
        try:
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, 60 * 60 * 36)
            remaining = max(0, DAILY_LIMIT - int(count))
            if int(count) > DAILY_LIMIT:
                raise RateLimitExceeded(remaining=0)
            return remaining
        finally:
            await client.aclose()
    except RateLimitExceeded:
        raise
    except Exception:
        # Memory fallback (dev / no redis)
        day = time.strftime("%Y%m%d")
        mem_key = f"{user_id}:{day}"
        start, count = _memory_buckets[mem_key]
        now = time.time()
        if start == 0.0:
            _memory_buckets[mem_key] = (now, 1)
            return DAILY_LIMIT - 1
        count += 1
        _memory_buckets[mem_key] = (start, count)
        if count > DAILY_LIMIT:
            raise RateLimitExceeded(remaining=0)
        return DAILY_LIMIT - count
