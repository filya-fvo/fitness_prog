"""AI quota must fail closed in production when Redis is unavailable."""

import pytest
import redis.asyncio as redis

from app.ai.rate_limiter import (
    DEFAULT_DAILY_LIMIT,
    RateLimitBackendUnavailable,
    _memory_buckets,
    consume_ai_quota,
)
from app.core.config import Settings


class BrokenRedisClient:
    async def incr(self, _key: str) -> int:
        raise ConnectionError("redis unavailable")

    async def aclose(self) -> None:
        return None


def broken_redis(*_args: object, **_kwargs: object) -> BrokenRedisClient:
    return BrokenRedisClient()


async def test_production_rate_limit_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(redis, "from_url", broken_redis)
    settings = Settings(environment="production")

    with pytest.raises(RateLimitBackendUnavailable):
        await consume_ai_quota("prod-user", settings)


async def test_development_rate_limit_uses_memory_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(redis, "from_url", broken_redis)
    _memory_buckets.clear()
    settings = Settings(environment="development")

    remaining = await consume_ai_quota("dev-user", settings)

    assert remaining == DEFAULT_DAILY_LIMIT - 1
