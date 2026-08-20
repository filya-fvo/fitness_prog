"""Regression tests for timer locking and paged notification dispatch."""

import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.models.user import User
from app.routers import notifications
from app.services.telegram_bot import TelegramBotError
from app.tasks import notifications as notification_tasks


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


class FakeDispatchRedis:
    def __init__(self) -> None:
        self.keys: set[str] = set()

    async def set(self, key, _value, *, nx=False, ex=None):
        del ex
        if nx and key in self.keys:
            return False
        self.keys.add(key)
        return True


@pytest.mark.asyncio
async def test_scheduled_dispatch_is_claimed_once_per_minute() -> None:
    redis = FakeDispatchRedis()
    assert await notification_tasks._claim_dispatch_minute(redis) is True
    assert await notification_tasks._claim_dispatch_minute(redis) is False


class FakeNotificationSession:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _value) -> None:
        return None


def reminder_item() -> dict[str, str]:
    return {
        "kind": "workout",
        "title": "Workout",
        "text": "Time",
        "startapp": "home",
        "state_key": "last_workout_mark",
        "state_value": "workout:2026-08-17",
    }


@pytest.mark.asyncio
async def test_failed_delivery_stays_retryable(monkeypatch) -> None:
    user = User(id=uuid4(), telegram_id=1, goals={})
    session = FakeNotificationSession()

    async def fail_telegram(*_args, **_kwargs):
        raise TelegramBotError("network unavailable")

    async def no_web_push(*_args, **_kwargs):
        return 0

    async def no_supplements(*_args, **_kwargs):
        return []

    monkeypatch.setattr(notifications, "due_notifications", lambda _goals: [reminder_item()])
    monkeypatch.setattr(notifications, "send_app_notification", fail_telegram)
    monkeypatch.setattr(notifications, "send_user_web_push", no_web_push)
    monkeypatch.setattr(notifications.supplement_intakes, "due_groups", no_supplements)

    sent = await notifications._dispatch_user(
        session,  # type: ignore[arg-type]
        user,
        Settings(jwt_secret="test-secret", bot_token="configured"),
    )
    assert sent == 0
    assert session.commits == 0
    assert "notification_state" not in user.goals


@pytest.mark.asyncio
async def test_successful_delivery_is_marked(monkeypatch) -> None:
    user = User(id=uuid4(), telegram_id=1, goals={})
    session = FakeNotificationSession()

    async def sent_telegram(*_args, **_kwargs):
        return {"ok": True}

    async def no_web_push(*_args, **_kwargs):
        return 0

    async def no_supplements(*_args, **_kwargs):
        return []

    monkeypatch.setattr(notifications, "due_notifications", lambda _goals: [reminder_item()])
    monkeypatch.setattr(notifications, "send_app_notification", sent_telegram)
    monkeypatch.setattr(notifications, "send_user_web_push", no_web_push)
    monkeypatch.setattr(notifications.supplement_intakes, "due_groups", no_supplements)

    sent = await notifications._dispatch_user(
        session,  # type: ignore[arg-type]
        user,
        Settings(jwt_secret="test-secret", bot_token="configured"),
    )
    assert sent == 1
    assert session.commits == 1
    assert user.goals["notification_state"]["last_workout_mark"] == "workout:2026-08-17"
