"""The local test account must never become a production login bypass."""

import uuid

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.main import app
from app.models.user import User


def _settings(*, environment: str = "development") -> Settings:
    return Settings(
        environment=environment,
        jwt_secret="local-test-auth-secret-at-least-32-characters",
    )


@pytest.mark.asyncio
async def test_local_test_login_rejects_production_even_from_loopback() -> None:
    app.dependency_overrides[get_settings] = lambda: _settings(environment="production")
    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 32100))
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/auth/local-test-user")
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_local_test_login_issues_regular_session_only_from_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings()
    user = User(
        telegram_id=None,
        username="local-tester",
        auth_email="local-test@filfit.invalid",
        anthropometry={},
        goals={"onboarding_completed": True},
        subscription_status="free",
        stars_balance=0,
    )
    user.id = uuid.UUID("00000000-0000-4000-8000-000000000456")

    class FakeDbSession:
        async def scalars(self, *_args, **_kwargs):
            class Empty:
                def all(self): return []
            return Empty()

    async def fake_db():
        yield FakeDbSession()

    async def fake_login(session, auth_settings):
        assert session is not None
        assert auth_settings is settings
        return user, "local-jwt"

    async def unavailable_profile(*_args, **_kwargs):
        raise RuntimeError("subscription tables are unavailable")

    monkeypatch.setattr("app.routers.auth.login_local_test_user", fake_login)
    monkeypatch.setattr("app.routers.auth.to_profile", unavailable_profile)
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: settings
    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 32100))
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/auth/local-test-user")
        assert response.status_code == 200
        assert response.json()["access_token"] == "local-jwt"
        assert response.json()["user"]["username"] == "local-tester"
    finally:
        app.dependency_overrides.clear()
