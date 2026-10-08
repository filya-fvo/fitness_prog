"""Actual server registration, authentication and safe sync boundaries."""

import uuid
import httpx
import pytest
from sqlalchemy.exc import DBAPIError
from app.main import app
from app.deps import get_current_user
from app.models.user import User
from app.routers import android_sync


@pytest.mark.asyncio
async def test_android_sync_requires_existing_account_session():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for method, path in (("GET", "/android-sync/v1/pull"), ("POST", "/android-sync/v1/push")):
            response = await client.request(method, path, json={} if method == "POST" else None)
            assert response.status_code in (401, 403), response.text
    assert "post" in app.openapi()["paths"]["/android-sync/v1/push"]
    assert "get" in app.openapi()["paths"]["/android-sync/v1/pull"]


@pytest.mark.asyncio
async def test_android_sync_rejects_invalid_cursor_and_oversized_page_without_database():
    app.dependency_overrides[get_current_user] = lambda: User(id=uuid.uuid4())
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            for params in (
                {"cursor": -1},
                {"cursor": 9223372036854775808},
                {"limit": 101},
                {"limit": 0},
            ):
                assert (await client.get("/android-sync/v1/pull", params=params)).status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_android_sync_database_failure_returns_safe_retry_message(monkeypatch):
    async def unavailable(*args):
        raise DBAPIError("SQL secret", {"private": "value"}, Exception("private failure"))

    monkeypatch.setattr(android_sync.sync_service, "pull", unavailable)
    app.dependency_overrides[get_current_user] = lambda: User(id=uuid.uuid4())
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/android-sync/v1/pull")
        assert response.status_code == 503
        assert response.json() == {"detail": "Синхронизация временно недоступна. Повторите позже."}
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_large_product_snapshot_stays_below_asyncpg_bind_limit(monkeypatch):
    from sqlalchemy.dialects.postgresql import dialect
    from app.services.android_sync import snapshot as module

    class EmptyRows:
        def unique(self):
            return self

        def all(self):
            return []

    class Session:
        async def scalars(self, query):
            if "nutrition_products" in str(query):
                count = len(
                    query.compile(
                        dialect=dialect(), compile_kwargs={"render_postcompile": True}
                    ).params
                )
                assert count <= 1000, f"Unbounded product IN query: {count} arguments"
            return EmptyRows()

    sizes = []

    async def personal(session, *, user_id, product_ids):
        assert len(product_ids) <= 1000
        sizes.append(len(product_ids))
        return {}

    monkeypatch.setattr(module.nutrition_corrections, "personal_values_map", personal)
    identifiers = {str(uuid.uuid4()) for _ in range(32768)}
    assert await module.snapshot(Session(), User(id=uuid.uuid4()), identifiers) == {}
    assert sum(sizes) == len(identifiers)
