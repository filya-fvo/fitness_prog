"""Stage 4 broadcast safety, authorization, and queue regressions."""

from __future__ import annotations

import uuid
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.schemas.admin_broadcast import AdminBroadcastAudience
from app.schemas.admin_broadcast import (
    AdminBroadcastCounts,
    AdminBroadcastDraftRequest,
    AdminBroadcastLaunchRequest,
)
from app.services import admin_audit, admin_broadcast_delivery, admin_broadcasts
from app.services.admin_audit import AuditContext
from app.services.telegram_bot import TelegramBotError
from app.tasks.notifications import WorkerSettings, send_broadcast_batch_task


class MutationSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0
        self.refreshes = 0

    def add(self, value: object) -> None:
        self.added.append(value)

    def add_all(self, values: list[object]) -> None:
        self.added.extend(values)

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _value: object) -> None:
        self.refreshes += 1

    async def execute(self, _statement):
        return SimpleNamespace()


class AuthSession:
    def __init__(self, user: object) -> None:
        self.user = user

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)


def test_audience_parameters_and_error_classification() -> None:
    with pytest.raises(ValidationError):
        AdminBroadcastAudience(kind="active")
    with pytest.raises(ValidationError):
        AdminBroadcastAudience(kind="program")
    with pytest.raises(ValidationError):
        AdminBroadcastAudience(kind="subscription")
    assert AdminBroadcastAudience(kind="inactive_workouts", days=30).days == 30
    with pytest.raises(ValidationError):
        AdminBroadcastDraftRequest(
            title="   ", message_text="Сообщение", audience={"kind": "all_telegram"},
            idempotency_key=uuid.uuid4(),
        )
    with pytest.raises(ValidationError):
        AdminBroadcastLaunchRequest(
            confirmed=True, confirmation_text="РАЗОСЛАТЬ 1", expected_recipient_count=1,
            scheduled_at="2026-08-28T12:00:00",
        )
    with pytest.raises(ValidationError):
        AdminBroadcastLaunchRequest(
            confirmed=True,
            confirmation_text="РАЗОСЛАТЬ 1",
            expected_recipient_count=1,
            scheduled_timezone="Moscow",
        )

    assert admin_broadcast_delivery.classify_telegram_error(
        TelegramBotError("Forbidden: bot was blocked by the user")
    ) == ("skipped", "telegram_unavailable")
    assert admin_broadcast_delivery.classify_telegram_error(
        TelegramBotError("Telegram transport error: timeout")
    ) == ("failed", "telegram_transport")


def test_broadcast_audit_never_accepts_message_content() -> None:
    session = MutationSession()
    secret_message = "Персональный текст рассылки"
    event = admin_audit.add_event(
        session,  # type: ignore[arg-type]
        context=AuditContext(uuid.uuid4(), uuid.uuid4()),
        action="broadcast.launch",
        object_type="broadcast",
        object_id=uuid.uuid4(),
        result="success",
        description="Рассылка поставлена в очередь.",
        after={"audience": "active", "expected": 10, "message_text": secret_message},
    )
    assert event.after_data == {"audience": "active", "expected": 10}
    assert secret_message not in str(event.after_data)


@pytest.mark.asyncio
async def test_launch_requires_test_and_double_confirmation(monkeypatch) -> None:
    campaign = SimpleNamespace(
        id=uuid.uuid4(),
        actor_user_id=uuid.uuid4(),
        audience={"kind": "all_telegram"},
        audience_count=0,
        status="draft",
        tested_at=None,
        scheduled_at=None,
        correlation_id=uuid.uuid4(),
    )
    session = MutationSession()

    async def fake_get(_session, _campaign_id, *, lock=False):
        return campaign

    async def fake_recipients(_session, _audience):
        return [(uuid.uuid4(), 101), (uuid.uuid4(), 102)]

    async def fake_response(_session, value):
        return value

    monkeypatch.setattr(admin_broadcasts, "_get", fake_get)
    monkeypatch.setattr(admin_broadcasts, "audience_recipients", fake_recipients)
    monkeypatch.setattr(admin_broadcasts, "_response", fake_response)
    context = AuditContext(campaign.actor_user_id, uuid.uuid4())

    with pytest.raises(HTTPException) as not_tested:
        await admin_broadcasts.launch(
            session, campaign.id, expected_count=2, confirmation_text="РАЗОСЛАТЬ 2",
            confirmed=True, scheduled_at=None, context=context,  # type: ignore[arg-type]
            scheduled_timezone="Europe/Moscow",
        )
    assert not_tested.value.status_code == 409

    campaign.status, campaign.tested_at = "tested", object()
    with pytest.raises(HTTPException) as not_confirmed:
        await admin_broadcasts.launch(
            session, campaign.id, expected_count=2, confirmation_text="да",
            confirmed=True, scheduled_at=None, context=context,  # type: ignore[arg-type]
            scheduled_timezone="Europe/Moscow",
        )
    assert not_confirmed.value.status_code == 400

    result = await admin_broadcasts.launch(
        session, campaign.id, expected_count=2, confirmation_text="РАЗОСЛАТЬ 2",
        confirmed=True, scheduled_at=None, context=context,  # type: ignore[arg-type]
        scheduled_timezone="Europe/Moscow",
    )
    assert result.status == "scheduled"
    assert result.scheduled_timezone == "Europe/Moscow"
    assert session.commits == 1
    assert session.refreshes == 1
    assert len([item for item in session.added if item.__class__.__name__ == "AdminBroadcastDelivery"]) == 2


@pytest.mark.asyncio
async def test_cancel_stops_only_not_started_scheduled_campaign(monkeypatch) -> None:
    campaign = SimpleNamespace(
        id=uuid.uuid4(),
        actor_user_id=uuid.uuid4(),
        audience={"kind": "all_telegram"},
        audience_count=2,
        status="scheduled",
        scheduled_at=object(),
        scheduled_timezone="Europe/Moscow",
        started_at=None,
        cancelled_at=None,
        correlation_id=uuid.uuid4(),
    )
    session = MutationSession()

    async def fake_get(_session, _campaign_id, *, lock=False):
        return campaign

    async def fake_counts(_session, _campaign):
        return AdminBroadcastCounts(expected=2, pending=2)

    async def fake_response(_session, value):
        return value

    monkeypatch.setattr(admin_broadcasts, "_get", fake_get)
    monkeypatch.setattr(admin_broadcasts, "_counts", fake_counts)
    monkeypatch.setattr(admin_broadcasts, "_response", fake_response)
    context = AuditContext(campaign.actor_user_id, uuid.uuid4())

    result = await admin_broadcasts.cancel_scheduled(
        session, campaign.id, context=context  # type: ignore[arg-type]
    )

    assert result.status == "cancelled"
    assert result.cancelled_at is not None
    assert session.commits == 1
    assert session.refreshes == 1
    assert any(getattr(item, "action", "") == "broadcast.cancel" for item in session.added)

    campaign.status = "sending"
    with pytest.raises(HTTPException) as already_started:
        await admin_broadcasts.cancel_scheduled(
            session, campaign.id, context=context  # type: ignore[arg-type]
        )
    assert already_started.value.status_code == 409


def test_routes_worker_and_migration_guards_exist() -> None:
    paths = app.openapi()["paths"]
    assert set(paths["/admin/broadcasts"]) == {"get", "post"}
    assert set(paths["/admin/broadcasts/audience-preview"]) == {"post"}
    for suffix in ("test", "launch", "retry", "copy", "cancel", "resume"):
        assert set(paths[f"/admin/broadcasts/{{campaign_id}}/{suffix}"]) == {"post"}
    assert send_broadcast_batch_task in WorkerSettings.functions
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260827000024_admin_broadcasts.sql"
    ).read_text(encoding="utf-8")
    assert "idempotency_key UUID NOT NULL UNIQUE" in migration
    assert "UNIQUE (broadcast_id, user_id)" in migration
    assert "message_text" in migration
    controls_migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260828000029_admin_broadcast_controls.sql"
    ).read_text(encoding="utf-8")
    assert "scheduled_timezone" in controls_migration
    assert "'cancelled'" in controls_migration


@pytest.mark.asyncio
async def test_regular_user_cannot_open_broadcast_center() -> None:
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
                "/admin/broadcasts", headers={"Authorization": f"Bearer {token}"}
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
