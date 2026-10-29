"""Real disposable PostgreSQL: migration, publication race and delivery claims."""
import asyncio
import importlib
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.core.database import Base
from app.models.user import User


@pytest_asyncio.fixture
async def database():
    url = os.environ.get("RELEASE_NOTICES_TEST_URL")
    if not url:
        pytest.skip("RELEASE_NOTICES_TEST_URL required for disposable PostgreSQL")
    parsed = make_url(url)
    assert parsed.host == "127.0.0.1" and parsed.database == "fitness_android_sync_test"
    schema = "release_notice_test_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    try:
        # Exercise the actual append-only SQL, not ORM create_all for these two tables.
        async with engine.begin() as conn:
            for kind in {c.type.name: c.type for t in Base.metadata.tables.values() for c in t.columns if isinstance(c.type, ENUM)}.values():
                await conn.run_sync(lambda sync, kind=kind: kind.create(sync, checkfirst=True))
            await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[t for name, t in Base.metadata.tables.items() if name not in {"release_notices", "release_notice_receipts"}]))
            raw = await conn.get_raw_connection()
            migration = Path(__file__).resolve().parents[2] / "supabase/migrations/20261029000000_release_notices.sql"
            await raw.driver_connection.execute(migration.read_text(encoding="utf-8"))
        async with factory() as session:
            actor = User(telegram_id=99901, goals={}, anthropometry={})
            android = User(goals={"android_notifications": {"enabled": True}}, anthropometry={})
            browser = User(goals={"notification_settings": {"delivery_channel": "browser"}}, anthropometry={})
            deleted = User(goals={}, anthropometry={}, is_deleted=True)
            session.add_all([actor, android, browser, deleted])
            await session.commit()
            yield factory, actor, android, browser, deleted
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


def payload(**changes):
    schema = importlib.import_module("app.schemas.release_notice")
    return schema.ReleaseNoticePublish(**{"release_key": "apk-27-test", "title": "Обновление", "message_text": "• Новые цели", "apk_version": 27,
        "apk_sha256": "a" * 64, "source_commit": "b" * 40, "shared_commit": "c" * 40, **changes})


def service():
    return importlib.import_module("app.services.release_notices")


def sender():
    return importlib.import_module("app.services.release_notice_delivery")


@pytest.mark.asyncio
async def test_publication_concurrent_idempotency_content_conflict_and_admin(database):
    factory, actor, android, browser, _ = database
    settings = Settings(admin_telegram_ids=str(actor.telegram_id))
    async def publish(body):
        async with factory() as session:
            return await service().publish_notice(session, body, actor_id=actor.id, settings=settings)
    first, replay = await asyncio.gather(publish(payload()), publish(payload()))
    assert first.id == replay.id
    async with factory() as session:
        counts = await service().notice_counts(session, first.id)
        assert counts == {"pending": 2, "awaiting_open": 1}
        with pytest.raises(HTTPException) as error:
            await service().publish_notice(session, payload(message_text="Иной текст"), actor_id=actor.id, settings=settings)
        assert error.value.status_code == 409
        await session.rollback()
        with pytest.raises(HTTPException) as alias:
            await service().publish_notice(session, payload(release_key="same-apk-alias"), actor_id=actor.id, settings=settings)
        assert alias.value.status_code == 409
        await session.rollback()
        session.add(User(goals={}, anthropometry={}))
        await session.commit()
        await service().publish_notice(session, payload(), actor_id=actor.id, settings=settings)
        assert await service().notice_counts(session, first.id) == {"pending": 2, "awaiting_open": 1}
        with pytest.raises(HTTPException) as denied:
            await service().publish_notice(session, payload(release_key="other"), actor_id=browser.id, settings=settings)
        assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_owner_read_ack_and_deletion(database):
    factory, actor, android, browser, _ = database
    async with factory() as session:
        notice = await service().publish_notice(session, payload(), actor_id=actor.id, settings=Settings(admin_telegram_ids=str(actor.telegram_id)))
        notice_id = notice.id
        items = await service().pending_notices(session, android.id)
        assert len(items) == 1 and items[0].id == notice_id
        assert len(await service().pending_notices(session, browser.id)) == 1
        await service().mark_seen(session, android.id, notice_id)
        await service().mark_seen(session, android.id, notice_id)
        assert await service().pending_notices(session, android.id) == []
        receipt_type = importlib.import_module("app.models.release_notice").ReleaseNoticeReceipt
        receipt = await session.get(receipt_type, (notice_id, android.id))
        assert receipt.seen_at is not None and receipt.status == "awaiting_open"
        owner = await session.get(User, android.id)
        owner.is_deleted = True
        await session.commit()
        assert await service().pending_notices(session, android.id) == []


@pytest.mark.asyncio
async def test_worker_concurrency_current_channel_quiet_and_interrupted_claim(database, monkeypatch):
    factory, actor, android, browser, _ = database
    now = datetime.now(UTC)
    async with factory() as session:
        notice = await service().publish_notice(session, payload(), actor_id=actor.id, settings=Settings(admin_telegram_ids=str(actor.telegram_id)))
        # Switch former browser to Android after snapshot; it must not get a browser push.
        owner = await session.get(User, browser.id)
        owner.goals = {"android_notifications": {"enabled": True}}
        await session.commit()
    send = AsyncMock(return_value=("sent", None))
    monkeypatch.setattr(sender(), "send_external", send)
    await asyncio.gather(*(sender().deliver_pending(factory, Settings(), now=now + timedelta(seconds=1)) for _ in range(2)))
    assert send.await_count == 1
    async with factory() as session:
        assert await service().notice_counts(session, notice.id) == {"sent": 1, "awaiting_open": 2}
        receipt_type = importlib.import_module("app.models.release_notice").ReleaseNoticeReceipt
        row = await session.scalar(select(receipt_type).where(receipt_type.user_id == actor.id))
        row.status = "sending"
        row.attempted_at = now - timedelta(hours=1)
        await session.commit()
    await sender().deliver_pending(factory, Settings(), now=now + timedelta(minutes=2))
    async with factory() as session:
        assert (await service().notice_counts(session, notice.id))["unknown"] == 1
    assert send.await_count == 1


@pytest.mark.asyncio
async def test_quiet_then_channel_change_and_deleted_recipient_never_send(database, monkeypatch):
    factory, actor, android, browser, _ = database
    now = datetime(2026, 10, 29, 20, tzinfo=UTC)
    async with factory() as session:
        owner = await session.get(User, actor.id)
        owner.goals = {"notification_settings": {"timezone": "Europe/Moscow", "quiet_hours": {"enabled": True, "start_time": "22:00", "end_time": "08:00"}}}
        other = await session.get(User, browser.id)
        other.is_deleted = True
        await session.commit()
        notice = await service().publish_notice(session, payload(), actor_id=actor.id, settings=Settings(admin_telegram_ids=str(actor.telegram_id)), now=now)
    send = AsyncMock(return_value=("sent", None))
    monkeypatch.setattr(sender(), "send_external", send)
    await sender().deliver_pending(factory, Settings(), now=now + timedelta(seconds=1))
    send.assert_not_awaited()
    async with factory() as session:
        owner = await session.get(User, actor.id)
        owner.is_deleted = True
        await session.commit()
    await sender().deliver_pending(factory, Settings(), now=now + timedelta(hours=12))
    send.assert_not_awaited()
    async with factory() as session:
        assert await service().notice_counts(session, notice.id) == {"skipped": 1, "awaiting_open": 1}

@pytest.mark.asyncio
async def test_claim_waits_for_preference_lock_before_final_check(database, monkeypatch):
    """A brief settings write after durable claim must not strand a no-send receipt."""
    factory, actor, _, _, _ = database
    now = datetime.now(UTC)
    async with factory() as session:
        notice = await service().publish_notice(session, payload(), actor_id=actor.id, settings=Settings(admin_telegram_ids=str(actor.telegram_id)))
    original_lock = sender()._lock_user_receipt
    entered, release = asyncio.Event(), asyncio.Event()
    lock_task = None
    calls = 0
    async def hold_preference():
        async with factory() as session:
            await session.scalar(select(User).where(User.id == actor.id).with_for_update())
            entered.set()
            await release.wait()
    async def release_later():
        await asyncio.sleep(0.3)
        release.set()
    async def interpose(session, notice_id, user_id, **kwargs):
        nonlocal calls, lock_task
        calls += 1
        if calls == 2:
            lock_task = asyncio.create_task(hold_preference())
            await entered.wait()
            asyncio.create_task(release_later())
        return await original_lock(session, notice_id, user_id, **kwargs)
    monkeypatch.setattr(sender(), "_lock_user_receipt", interpose)
    send = AsyncMock(return_value=("sent", None))
    monkeypatch.setattr(sender(), "send_external", send)
    try:
        await sender()._deliver_one(factory, Settings(), notice.id, actor.id, now + timedelta(seconds=1))
    finally:
        release.set()
        if lock_task:
            await lock_task
    assert send.await_count == 1


@pytest.mark.asyncio
async def test_overlay_for_all_channels_is_independent_of_external_delivery(database, monkeypatch):
    factory, actor, android, browser, _ = database
    async with factory() as session:
        notice = await service().publish_notice(session, payload(), actor_id=actor.id, settings=Settings(admin_telegram_ids=str(actor.telegram_id)))
        notice_id = notice.id
        # The Telegram-selected account can close its overlay before worker dispatch.
        assert len(await service().pending_notices(session, actor.id)) == 1
        await service().mark_seen(session, actor.id, notice_id)
        assert await service().pending_notices(session, actor.id) == []
        receipt_type = importlib.import_module("app.models.release_notice").ReleaseNoticeReceipt
        row = await session.get(receipt_type, (notice_id, actor.id))
        assert row.status == "pending" and row.seen_at is not None
    send = AsyncMock(return_value=("sent", None))
    monkeypatch.setattr(sender(), "send_external", send)
    await sender().deliver_pending(factory, Settings(), now=datetime.now(UTC) + timedelta(seconds=1))
    assert send.await_count == 2
    async with factory() as session:
        # A confirmed browser delivery still leaves its in-app summary unread.
        assert len(await service().pending_notices(session, browser.id)) == 1
        await service().mark_seen(session, browser.id, notice_id)
        row = await session.get(receipt_type, (notice_id, browser.id))
        assert row.status == "sent" and row.seen_at is not None
        assert await service().overlay_counts(session, notice_id) == {"overlay_seen": 2, "overlay_unread": 1}
        await service().mark_seen(session, browser.id, notice_id)
        assert await service().pending_notices(session, browser.id) == []
        outsider = User(goals={}, anthropometry={})
        session.add(outsider)
        await session.commit()
        assert await service().pending_notices(session, outsider.id) == []
        with pytest.raises(HTTPException) as denied:
            await service().mark_seen(session, outsider.id, notice_id)
        assert denied.value.status_code == 404

@pytest.mark.asyncio
@pytest.mark.parametrize("inject_clock", [False, True])
async def test_batch_rechecks_quiet_hours_before_each_recipient(database, monkeypatch, inject_clock):
    """Earlier network latency must not carry later sends into quiet hours."""
    factory, actor, android, browser, _ = database
    clock = [datetime(2026, 10, 29, 21, 59, 59, tzinfo=UTC)]
    class Clock:
        @staticmethod
        def now(tz=None):
            return clock[0]
    if not inject_clock:
        monkeypatch.setattr(sender(), "datetime", Clock)
    async with factory() as session:
        for identity in (actor, android, browser):
            owner = await session.get(User, identity.id)
            owner.goals = {"notification_settings": {"timezone": "UTC", "quiet_hours": {
                "enabled": True, "start_time": "22:00", "end_time": "08:00"}}}
        await session.commit()
        notice = await service().publish_notice(session, payload(), actor_id=actor.id,
            settings=Settings(admin_telegram_ids=str(actor.telegram_id)), now=clock[0])
    calls = []
    async def send(*args):
        calls.append(clock[0])
        clock[0] = datetime(2026, 10, 29, 22, 0, 1, tzinfo=UTC)
        return "sent", None
    monkeypatch.setattr(sender(), "send_external", send)
    await sender().deliver_pending(factory, Settings(), **({"clock": lambda: clock[0]} if inject_clock else {}))
    assert len(calls) == 1
    async with factory() as session:
        assert await service().notice_counts(session, notice.id) == {"sent": 1, "pending": 2}
        receipt_type = importlib.import_module("app.models.release_notice").ReleaseNoticeReceipt
        pending = list(await session.scalars(select(receipt_type).where(receipt_type.status == "pending")))
        assert all(row.attempted_at is None and row.next_attempt_at > clock[0] for row in pending)


@pytest.mark.asyncio
async def test_final_lock_wait_crossing_quiet_boundary_defers_without_transport(database, monkeypatch):
    factory, actor, _, _, _ = database
    clock = [datetime(2026, 10, 29, 21, 59, 59, tzinfo=UTC)]
    class Clock:
        @staticmethod
        def now(tz=None):
            return clock[0]
    monkeypatch.setattr(sender(), "datetime", Clock)
    async with factory() as session:
        owner = await session.get(User, actor.id)
        owner.goals = {"notification_settings": {"timezone": "UTC", "quiet_hours": {
            "enabled": True, "start_time": "22:00", "end_time": "08:00"}}}
        await session.commit()
        notice = await service().publish_notice(session, payload(), actor_id=actor.id,
            settings=Settings(admin_telegram_ids=str(actor.telegram_id)), now=clock[0])
        notice_id = notice.id
    original_lock = sender()._lock_user_receipt
    async def lock_wait(session, notice_id, user_id, **kwargs):
        result = await original_lock(session, notice_id, user_id, **kwargs)
        if user_id == actor.id and kwargs.get("skip_locked") is False:
            # Simulate the time spent waiting for the actual final settings row lock.
            clock[0] = datetime(2026, 10, 29, 22, 0, 1, tzinfo=UTC)
        return result
    monkeypatch.setattr(sender(), "_lock_user_receipt", lock_wait)
    sent_owners = []
    async def send(session, settings, owner, notice, channel):
        sent_owners.append(owner.id)
        return "sent", None
    monkeypatch.setattr(sender(), "send_external", send)
    await sender().deliver_pending(factory, Settings())
    assert actor.id not in sent_owners
    async with factory() as session:
        receipt_type = importlib.import_module("app.models.release_notice").ReleaseNoticeReceipt
        receipt = await session.get(receipt_type, (notice_id, actor.id))
        assert receipt.status == "pending" and receipt.attempted_at is None
        assert receipt.next_attempt_at > clock[0]

@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_http_expected_owner_rejects_native_credential_transition(database, method):
    """Same campaign ID belongs to A and B; old A intent cannot use a new B JWT."""
    import httpx
    from app.main import app
    from app.core.database import get_db
    from app.deps import get_current_user
    from app.models.release_notice import ReleaseNoticeReceipt
    factory, actor, android, browser, _ = database
    async with factory() as session:
        notice = await service().publish_notice(session, payload(), actor_id=actor.id,
            settings=Settings(admin_telegram_ids=str(actor.telegram_id)))
    async def db():
        async with factory() as session:
            yield session
    async def authenticated_new_owner():
        return browser
    previous = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = authenticated_new_owner
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            path = "/notifications/release-notices" + (f"/{notice.id}/seen" if method == "POST" else "")
            response = await client.request(method, path, params={"expected_owner": str(android.id)})
        assert response.status_code == 409
        async with factory() as session:
            assert (await session.get(ReleaseNoticeReceipt, (notice.id, browser.id))).seen_at is None
            assert (await session.get(ReleaseNoticeReceipt, (notice.id, android.id))).seen_at is None
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


@pytest.mark.asyncio
async def test_http_summary_requires_expected_owner_and_accepts_matching_owner(database):
    import httpx
    from app.main import app
    from app.core.database import get_db
    from app.deps import get_current_user
    from app.models.release_notice import ReleaseNoticeReceipt
    factory, actor, android, browser, _ = database
    async with factory() as session:
        notice = await service().publish_notice(session, payload(), actor_id=actor.id,
            settings=Settings(admin_telegram_ids=str(actor.telegram_id)))
    async def db():
        async with factory() as session:
            yield session
    async def authenticated_owner():
        return android
    previous = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = authenticated_owner
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/notifications/release-notices")).status_code == 422
            params = {"expected_owner": str(android.id)}
            read = await client.get("/notifications/release-notices", params=params)
            assert read.status_code == 200 and read.json()["items"][0]["id"] == str(notice.id)
            assert (await client.post(f"/notifications/release-notices/{notice.id}/seen", params=params)).status_code == 200
            assert (await client.get("/notifications/release-notices", params=params)).json() == {"items": []}
        async with factory() as session:
            assert (await session.get(ReleaseNoticeReceipt, (notice.id, android.id))).seen_at is not None
            assert (await session.get(ReleaseNoticeReceipt, (notice.id, browser.id))).seen_at is None
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
