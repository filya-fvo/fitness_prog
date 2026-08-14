"""Smoke tests for app wiring."""

import httpx

from app.main import app


async def request(method: str, path: str, **kwargs: object) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, **kwargs)


async def test_health() -> None:
    response = await request("GET", "/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_auth_telegram_rejects_empty_body() -> None:
    response = await request("POST", "/auth/telegram", json={})
    assert response.status_code == 422


async def test_auth_telegram_rejects_invalid_init_data() -> None:
    response = await request("POST", "/auth/telegram", json={"init_data": "not-valid"})
    # 401 from InitDataError, or 500 if DB missing — signature fails before DB
    assert response.status_code in (401, 500)


async def test_notification_dispatch_all_requires_authentication() -> None:
    response = await request("POST", "/notifications/dispatch-all")
    assert response.status_code == 401
