from __future__ import annotations

import pytest

from app.core.config import Settings
from app.schemas.admin_system import AdminSystemStatusResponse
from app.tasks import notifications


def test_notification_settings_reloads_current_configuration(monkeypatch) -> None:
    current = Settings(mini_app_url="https://current-host.example.ts.net")
    monkeypatch.setattr(notifications, "Settings", lambda: current)

    assert notifications.notification_settings() is current


@pytest.mark.asyncio
async def test_reminder_job_ignores_stale_worker_settings(monkeypatch) -> None:
    stale = Settings(mini_app_url="https://obsolete.example.ts.net")
    current = Settings(mini_app_url="https://current.example.ts.net")
    captured: dict[str, Settings] = {}

    async def fake_send(settings: Settings, **_kwargs):
        captured["settings"] = settings
        return {"result": {"message_id": 1}}

    monkeypatch.setattr(notifications, "notification_settings", lambda: current)
    monkeypatch.setattr(notifications, "send_workout_reminder", fake_send)

    result = await notifications.send_reminder_task(
        {"settings": stale},
        telegram_id=1,
        workout_id="workout-1",
    )

    assert result["ok"] is True
    assert captured["settings"] is current


@pytest.mark.asyncio
async def test_scheduled_system_snapshot_uses_sanitized_history_service(monkeypatch) -> None:
    settings = Settings(jwt_secret="test")
    captured: dict[str, object] = {}

    class SessionContext:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    async def fake_collect(session, current_settings, *, source):
        captured.update(session=session, settings=current_settings, source=source)
        return (
            AdminSystemStatusResponse(
                checked_at="2026-08-30T12:00:00Z",
                overall_status="attention",
                items=[],
            ),
            True,
        )

    async def fake_worker_status(*_args, **_kwargs):
        return None

    monkeypatch.setattr(notifications, "notification_settings", lambda: settings)
    monkeypatch.setattr(notifications, "AsyncSessionLocal", SessionContext)
    monkeypatch.setattr(notifications, "collect_and_record_system_status", fake_collect)
    monkeypatch.setattr(notifications, "_record_worker_status", fake_worker_status)

    result = await notifications.snapshot_admin_system_task({"redis": object()})

    assert result == {"ok": True, "overall_status": "attention"}
    assert captured["source"] == "scheduled"
    assert captured["settings"] is settings
