"""Exercise real row locks only in the fixed disposable Android test database."""

import os
from pathlib import Path

os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://fitness_android_test@127.0.0.1:55439/fitness_android_sync_test"
)
os.environ["LOG_DIR"] = str(
    Path(__file__).resolve().parents[2] / "artifacts" / "android-sync-release" / "logs"
)

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.database import Base
from app.models.user import User
from app.routers.notifications import NotificationSettingsUpdate, put_settings_route
from app.schemas.android_notifications import AndroidDeliveryUpdate
from app.services.android_notification_delivery import android_delivery_state, update_android_delivery
from app.services.android_notification_plan import build_android_notification_plan


async def main():
    engine = create_async_engine(os.environ["DATABASE_URL"])
    owner = uuid4()
    now = datetime.now(UTC)
    created = False
    try:
        async with engine.begin() as connection:
            assert await connection.scalar(text("SELECT current_database()")) == "fitness_android_sync_test"
            for table in Base.metadata.tables.values():
                for column in table.columns:
                    typ = column.type
                    if hasattr(typ, "enums") and getattr(typ, "name", None):
                        await connection.run_sync(lambda sync, typ=typ: typ.create(sync, checkfirst=True))
            await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(engine, expire_on_commit=False) as session:
            user = User(id=owner, goals={"notification_settings": {"delivery_channel": "telegram"}}, anthropometry={})
            session.add(user)
            await session.commit()
            created = True
            original_plan = await build_android_notification_plan(session, user, now=now)
        bodies = [AndroidDeliveryUpdate(
            operation_id=uuid4(), device_id=uuid4(), enabled=True, expected_revision=0,
            expected_settings_revision=original_plan.settings_revision,
        ) for _ in range(2)]

        async def select_mode(body):
            async with AsyncSession(engine, expire_on_commit=False) as session:
                try:
                    return await update_android_delivery(session, owner, body, now=now)
                except HTTPException as exc:
                    await session.rollback()
                    assert exc.status_code == 409
                    return None

        results = await asyncio.gather(*(select_mode(body) for body in bodies))
        assert sum(result is not None for result in results) == 1, "CAS did not select exactly one winner"
        winner_index = next(index for index, result in enumerate(results) if result is not None)
        winner = bodies[winner_index]
        receipt = results[winner_index]
        async with AsyncSession(engine, expire_on_commit=False) as session:
            disabled = await update_android_delivery(session, owner, AndroidDeliveryUpdate(
                operation_id=uuid4(), device_id=winner.device_id, enabled=False, expected_revision=1,
            ), now=now)
            assert disabled.revision == 2
        assert await select_mode(winner) == receipt
        async with AsyncSession(engine) as session:
            user = await session.get(User, owner)
            assert android_delivery_state(user.goals).revision == 2
            assert android_delivery_state(user.goals).enabled is False

        # Both callers load stale identities before either transition. The category
        # writer must reload under its lock, rather than replacing a newer goals JSON.
        async with AsyncSession(engine, expire_on_commit=False) as stale_session:
            stale_user = await stale_session.get(User, owner)
            plan = await build_android_notification_plan(stale_session, stale_user, now=now)
            body = AndroidDeliveryUpdate(
                operation_id=uuid4(), device_id=winner.device_id, enabled=True, expected_revision=2,
                expected_settings_revision=plan.settings_revision,
            )
            async def save_category():
                return await put_settings_route(
                    NotificationSettingsUpdate(settings={"water": {"enabled": True}}),
                    session=stale_session, user=stale_user,
                )
            enabled, _category = await asyncio.gather(select_mode(body), save_category())
            if enabled is None:
                async with AsyncSession(engine) as session:
                    current = await session.get(User, owner)
                    refreshed = await build_android_notification_plan(session, current, now=now)
                body = body.model_copy(update={"expected_settings_revision": refreshed.settings_revision})
                assert await select_mode(body) is not None
            # Deliberately reuse the old ORM identity again after activation.
            await put_settings_route(
                NotificationSettingsUpdate(settings={"calories": {"enabled": True}}),
                session=stale_session, user=stale_user,
            )
        async with AsyncSession(engine) as session:
            current = await session.scalar(select(User).where(User.id == owner))
            assert android_delivery_state(current.goals).enabled is True
            assert android_delivery_state(current.goals).revision == 3
            assert current.goals["notification_settings"]["water"]["enabled"] is True
            assert current.goals["notification_settings"]["calories"]["enabled"] is True
            assert current.goals["notification_settings"]["delivery_channel"] == "telegram"
        # A skipped Android owner must be unlocked before unrelated slow delivery.
        from app.core.config import Settings
        from app.routers import notifications as routes
        slow_owner = type(owner)(int=owner.int + 1)
        entered, release = asyncio.Event(), asyncio.Event()
        dispatch_original = routes._dispatch_user
        async with AsyncSession(engine) as session:
            session.add(User(id=slow_owner, goals={}, anthropometry={}))
            await session.commit()
        async def isolated_dispatch(session, user, settings):
            user_id = user.id if isinstance(user, User) else user
            if user_id == owner:
                return await dispatch_original(session, user, settings)
            if user_id == slow_owner:
                entered.set()
                await release.wait()
            return 0  # Never send real notifications in this disposable database.
        routes._dispatch_user = isolated_dispatch
        task = None
        try:
            async with AsyncSession(engine, expire_on_commit=False) as dispatch_session:
                task = asyncio.create_task(routes.dispatch_all_users(dispatch_session, Settings(jwt_secret="test")))
                await asyncio.wait_for(entered.wait(), timeout=10)
                async with AsyncSession(engine) as concurrent:
                    await concurrent.execute(text("SET LOCAL lock_timeout = '1000ms'"))
                    assert await concurrent.scalar(select(User).where(User.id == owner).with_for_update()) is not None
                    await concurrent.rollback()
                release.set()
                assert (await task)["errors"] == 0
        finally:
            release.set()
            if task is not None:
                await task
            routes._dispatch_user = dispatch_original
            async with engine.begin() as connection:
                await connection.execute(delete(User).where(User.id == slow_owner))
        print("ANDROID_NOTIFICATIONS_POSTGRES_OK: CAS race, lost ACK replay, stale category identity, per-user lock release")
    finally:
        if created:
            async with engine.begin() as connection:
                await connection.execute(delete(User).where(User.id == owner))
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
