"""Supplement delivery regressions with isolated PostgreSQL and no real messages."""

import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import create_engine, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import make_url
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session

from app.models.supplement_intake import SupplementIntake
from app.models.user import User, subscription_status_enum
from app.routers import supplements
from app.services import supplement_intakes

NOW = datetime(2026, 11, 12, 12, tzinfo=UTC)


class FixedDateTime(datetime):
    current = NOW

    @classmethod
    def now(cls, tz=None):
        return cls.current.astimezone(tz) if tz else cls.current.replace(tzinfo=None)


@compiles(JSONB, "sqlite")
def sqlite_jsonb(_type, _compiler, **_kwargs):
    return "JSON"


class AsyncSqliteSession:
    def __init__(self, engine):
        self.sync = Session(engine, expire_on_commit=False, autoflush=False)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        self.sync.close()

    async def get(self, *args, **kwargs):
        return self.sync.get(*args, **kwargs)

    async def scalar(self, *args, **kwargs):
        return self.sync.scalar(*args, **kwargs)

    async def scalars(self, *args, **kwargs):
        return self.sync.scalars(*args, **kwargs)

    async def execute(self, *args, **kwargs):
        return self.sync.execute(*args, **kwargs)

    async def commit(self):
        self.sync.commit()

    async def refresh(self, *args, **kwargs):
        self.sync.refresh(*args, **kwargs)

    def add(self, *args, **kwargs):
        return self.sync.add(*args, **kwargs)


async def create_test_user(factory):
    async with factory() as session:
        user = User(
            telegram_id=99901,
            anthropometry={},
            goals={
                "notification_settings": {"timezone": "UTC"},
                "supplements": [
                    {"id": "magnesium", "key": "magnesium", "name_ru": "Магний", "times": ["08:00"]},
                ],
            },
        )
        session.add(user)
        await session.commit()
        return user.id


@pytest_asyncio.fixture
async def database(monkeypatch, tmp_path):
    monkeypatch.setattr(supplement_intakes, "datetime", FixedDateTime)
    url = os.environ.get("FITNESS_SUPPLEMENT_TEST_URL")
    if not url:
        engine = create_engine(f"sqlite:///{tmp_path / 'intakes.sqlite'}")
        with engine.begin() as connection:
            User.__table__.create(connection)
            SupplementIntake.__table__.create(connection)
        def make_sqlite_factory(session_class=AsyncSqliteSession):
            return lambda: session_class(engine)
        factory = make_sqlite_factory()
        try:
            yield factory, await create_test_user(factory), AsyncSqliteSession, make_sqlite_factory
        finally:
            engine.dispose()
        return
    assert make_url(url).host == "127.0.0.1"
    schema = "supplement_dispatch_test_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    def make_postgres_factory(session_class=AsyncSession):
        return async_sessionmaker(engine, class_=session_class, expire_on_commit=False, autoflush=False)
    factory = make_postgres_factory()
    try:
        async with engine.begin() as connection:
            await connection.run_sync(subscription_status_enum.create)
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(SupplementIntake.__table__.create)
        yield factory, await create_test_user(factory), AsyncSession, make_postgres_factory
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["initialize", "put", "catalog", "custom", "remove"])
async def test_stack_write_preserves_goals_committed_after_authentication(database, action):
    factory, user_id, *_ = database
    receipt = {"key": str(uuid4()), "request": {"source": "2026-11-12", "target": "2026-11-13"}}
    async with factory() as request:
        authenticated = await request.get(User, user_id)
        async with factory() as concurrent:
            current = await concurrent.get(User, user_id)
            current.goals = {**current.goals, "workout_reschedule_requests": [receipt]}
            await concurrent.commit()

        if action == "initialize":
            await supplements.get_stack(session=request, user=authenticated)
        elif action == "put":
            await supplements.put_stack(supplements.SupplementStackUpdate(items=[]), request, authenticated)
        elif action == "catalog":
            key = next(key for key in supplements.catalog_by_key() if key != "magnesium")
            await supplements.add_from_catalog(supplements.AddFromCatalogRequest(key=key), request, authenticated)
        elif action == "custom":
            await supplements.add_custom(supplements.AddCustomRequest(name_ru="Добавка"), request, authenticated)
        else:
            await supplements.remove_entry("magnesium", request, authenticated)

    async with factory() as session:
        current = await session.get(User, user_id)
        assert current.goals["workout_reschedule_requests"] == [receipt]
        assert current.goals["supplements_initialized"] is True


@pytest.mark.asyncio
async def test_stack_change_rolls_back_if_intake_cleanup_fails(database, monkeypatch):
    factory, user_id, *_ = database

    async def failing_cleanup(*_args, **_kwargs):
        raise RuntimeError("synthetic cleanup failure")

    monkeypatch.setattr(supplements.supplement_intakes, "reset_pending_schedule", failing_cleanup)
    async with factory() as request:
        user = await request.get(User, user_id)
        with pytest.raises(RuntimeError, match="synthetic cleanup failure"):
            await supplements.put_stack(supplements.SupplementStackUpdate(items=[]), request, user)
    async with factory() as session:
        current = await session.get(User, user_id)
        assert [item["id"] for item in current.goals["supplements"]] == ["magnesium"]
