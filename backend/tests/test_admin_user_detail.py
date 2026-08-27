"""Stage 3 admin user card contracts and safety regressions."""

from __future__ import annotations

import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
import httpx
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.user import User
from app.schemas.admin_user import AdminServiceMessageRequest
from app.services import admin_user_actions, admin_user_detail
from app.services.admin_audit import AuditContext


class AddCommitSession:
    def __init__(self) -> None:
        self.added = []
        self.commits = 0

    def add(self, value) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        self.commits += 1


class AuthSession:
    def __init__(self, user) -> None:
        self.user = user

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)


def test_questionnaire_and_merge_state_are_allowlisted() -> None:
    source = uuid.uuid4()
    user = User(
        id=uuid.uuid4(),
        telegram_id=42,
        username="athlete",
        auth_email="athlete@example.test",
        anthropometry={
            "sex": "male",
            "birth_date": "1990-05-12",
            "weight_kg": "82.5",
            "private_note": "must not leak",
        },
        goals={
            "primary_goal": "gain_muscle",
            "equipment": ["barbell"],
            "_merged_from_user_ids": [str(source)],
            "_last_merge_preference": "telegram",
            "secret": "must not leak",
        },
        subscription_status="free",
        is_deleted=False,
    )

    questionnaire = admin_user_detail.questionnaire_snapshot(user).model_dump()
    state, count, preference = admin_user_detail.merge_state(user)

    assert questionnaire["weight_kg"] == 82.5
    assert questionnaire["equipment"] == ["barbell"]
    assert "private_note" not in questionnaire
    assert "secret" not in questionnaire
    assert (state, count, preference) == ("merged_primary", 1, "telegram")


def test_notification_toggle_preserves_schedule_and_requires_real_text() -> None:
    goals = {
        "primary_goal": "maintain",
        "notification_settings": {
            "timezone": "Asia/Yekaterinburg",
            "workouts": {"enabled": True, "time": "07:15", "days": [1, 3]},
        },
    }
    updated = admin_user_actions.set_notification_categories(goals, False)

    assert updated["primary_goal"] == "maintain"
    assert updated["notification_settings"]["timezone"] == "Asia/Yekaterinburg"
    assert updated["notification_settings"]["workouts"]["time"] == "07:15"
    assert all(
        updated["notification_settings"][key]["enabled"] is False
        for key in ("measurements", "workouts", "supplements", "water", "calories")
    )
    with pytest.raises(ValidationError):
        AdminServiceMessageRequest(text="   \n ")


@pytest.mark.asyncio
async def test_service_message_is_escaped_and_never_written_to_audit(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4(), telegram_id=42)
    session = AddCommitSession()
    sent: dict[str, object] = {}

    async def fake_user(_session, _user_id):
        return user

    async def fake_send(_settings, **kwargs):
        sent.update(kwargs)
        return {"ok": True}

    monkeypatch.setattr(admin_user_actions.admin_users, "get_user_or_404", fake_user)
    monkeypatch.setattr(admin_user_actions, "send_app_notification", fake_send)
    raw = "Проверка <b>без HTML</b> & токен"
    result = await admin_user_actions.send_service_message(  # type: ignore[arg-type]
        session,
        user.id,
        text=raw,
        settings=Settings(jwt_secret="test"),
        context=AuditContext(uuid.uuid4(), uuid.uuid4()),
    )

    assert sent["text"] == "Проверка &lt;b&gt;без HTML&lt;/b&gt; &amp; токен"
    assert result.notified is True
    assert session.commits == 1
    assert len(session.added) == 2
    assert raw not in " ".join(event.description for event in session.added)
    assert raw not in str([event.before_data for event in session.added])
    assert raw not in str([event.after_data for event in session.added])


def test_admin_user_routes_and_export_allowlist() -> None:
    paths = app.openapi()["paths"]
    assert set(paths["/admin/users/{user_id}/summary"]) == {"get"}
    assert set(paths["/admin/users/{user_id}/activity"]) == {"get"}
    assert set(paths["/admin/users/{user_id}/communications"]) == {"get"}
    assert set(paths["/admin/users/{user_id}/message"]) == {"post"}
    assert set(paths["/admin/users/{user_id}/resend-guide"]) == {"post"}
    assert set(paths["/admin/users/{user_id}/notifications"]) == {"patch"}
    assert set(paths["/admin/users/{user_id}/export"]) == {"post"}

    source = (
        Path(__file__).resolve().parents[1] / "app" / "services" / "admin_user_export.py"
    ).read_text(encoding="utf-8")
    assert "EmailOtp" not in source
    assert "WebPushSubscription" not in source
    assert '"endpoint"' not in source
    assert '"p256dh"' not in source
    assert '"auth"' not in source


@pytest.mark.asyncio
async def test_regular_user_cannot_open_user_card() -> None:
    regular = SimpleNamespace(id=uuid.uuid4(), telegram_id=42, username="reader")
    settings = Settings(admin_telegram_usernames="owner", jwt_secret="test")

    async def fake_db():
        yield AuthSession(regular)

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: settings
    token = create_access_token(
        subject=str(regular.id), telegram_id=regular.telegram_id, settings=settings
    )
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/admin/users/{regular.id}/summary",
                headers={"Authorization": f"Bearer {token}"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {"detail": "Требуются права администратора"}
