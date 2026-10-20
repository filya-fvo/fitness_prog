"""Canonical guide downloads and the real administrator authorization boundary."""
import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.services import telegram_bot


@pytest.fixture
def guide_context(monkeypatch, tmp_path):
    settings = Settings(jwt_secret="guide-test-secret", admin_telegram_ids="42", admin_telegram_usernames="")
    user = SimpleNamespace(id=uuid.uuid4(), telegram_id=42, username=None)

    class Session:
        async def execute(self, _statement):
            return SimpleNamespace(scalar_one_or_none=lambda: user)

    async def database():
        yield Session()

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_settings] = lambda: settings
    text = "# Полная инструкция\n\nРусский текст: суперсет и трисет.\n"
    for kind in ("user", "admin"):
        path = tmp_path / f"{kind}.md"
        path.write_text(text, encoding="utf-8-sig", newline="\n")
        monkeypatch.setattr(telegram_bot, f"{kind}_guide_path", lambda p=path: p)
    token = create_access_token(subject=str(user.id), settings=settings)
    try:
        yield user, {"Authorization": f"Bearer {token}"}, text, tmp_path
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("kind,filename", [
    ("user", "Fitness_Mini_App_Instrukciya.md"),
    ("admin", "Fitness_Mini_App_Admin_Instrukciya.md"),
])
async def test_guide_download_uses_canonical_utf8_attachment(guide_context, kind, filename):
    _, headers, text, _ = guide_context
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/guides/{kind}", headers=headers if kind == "admin" else {})
    assert response.status_code == 200
    assert response.content == text.encode("utf-8")
    assert response.headers["content-type"].startswith("text/markdown")
    assert response.headers["content-disposition"] == f'attachment; filename="{filename}"'
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_admin_guide_does_not_allow_anonymous_or_regular_users(guide_context):
    user, headers, _, _ = guide_context
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        anonymous = await client.get("/guides/admin")
        user.telegram_id = 7
        regular = await client.get("/guides/admin", headers=headers)
    assert anonymous.status_code in (401, 403)
    assert regular.status_code == 403
    assert "Полная инструкция" not in anonymous.text + regular.text


@pytest.mark.parametrize("kind", ["user", "admin"])
async def test_unavailable_guide_returns_safe_retry_message(guide_context, kind):
    _, headers, _, directory = guide_context
    (directory / f"{kind}.md").unlink()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/guides/{kind}", headers=headers)
    assert response.status_code == 503
    assert "Попробуйте позже" in response.json()["detail"]
    assert str(directory) not in response.text


async def test_guide_type_is_not_a_file_path(guide_context):
    _, headers, _, _ = guide_context
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/guides/LOCAL_ADMIN_GUIDE.md", headers=headers)
    assert response.status_code == 404


@pytest.mark.parametrize("kind", ["user", "admin"])
async def test_invalid_guide_encoding_is_not_sent_as_a_successful_file(guide_context, kind):
    _, headers, _, directory = guide_context
    (directory / f"{kind}.md").write_bytes(b"\xff\xfeinvalid")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/guides/{kind}", headers=headers)
    assert response.status_code == 503
    assert "Попробуйте позже" in response.json()["detail"]


async def test_unreadable_guide_returns_safe_retry_message(guide_context, monkeypatch):
    def denied():
        raise PermissionError("private filesystem path")

    monkeypatch.setattr(telegram_bot, "load_user_guide_bytes", denied)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/guides/user")
    assert response.status_code == 503
    assert "Попробуйте позже" in response.json()["detail"]
    assert "private filesystem" not in response.text
