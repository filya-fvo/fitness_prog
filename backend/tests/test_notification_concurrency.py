"""Regression tests for timer locking and paged notification dispatch."""

import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.routers import notifications


class FakeRedisLock:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def set(self, key, value, *, nx=False, px=None):
        del px
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def eval(self, _script, _keys_count, key, token):
        if self.values.get(key) == token:
            del self.values[key]
            return 1
        return 0


@pytest.mark.asyncio
async def test_timer_lock_serializes_same_timer() -> None:
    redis = FakeRedisLock()
    key, token = await notifications._acquire_timer_lock(redis, "timer:user:workout")
    waiter = asyncio.create_task(
        notifications._acquire_timer_lock(redis, "timer:user:workout")
    )
    await asyncio.sleep(0)
    assert not waiter.done()
    await notifications._release_timer_lock(redis, key, token)
    next_key, next_token = await waiter
    assert next_token != token
    await notifications._release_timer_lock(redis, next_key, next_token)


class FakeScalarResult:
    def __init__(self, rows) -> None:
        self.rows = rows

    def __iter__(self):
        return iter(self.rows)


class FakePagedSession:
    def __init__(self, batches) -> None:
        self.batches = list(batches)

    async def scalars(self, _statement):
        return FakeScalarResult(self.batches.pop(0))


@pytest.mark.asyncio
async def test_dispatch_all_users_reads_until_empty_page(monkeypatch) -> None:
    users = [SimpleNamespace(id=uuid4()) for _ in range(3)]
    session = FakePagedSession([users[:2], users[2:], []])
    dispatched = []

    async def fake_dispatch(_session, user, _settings):
        dispatched.append(user.id)
        return 1

    monkeypatch.setattr(notifications, "_dispatch_user", fake_dispatch)
    result = await notifications.dispatch_all_users(
        session,  # type: ignore[arg-type]
        Settings(jwt_secret="test-secret"),
    )
    assert dispatched == [user.id for user in users]
    assert result == {"ok": True, "users": 3, "sent": 3, "errors": 0}
