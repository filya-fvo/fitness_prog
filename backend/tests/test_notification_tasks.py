from __future__ import annotations

import pytest

from app.core.config import Settings
from app.tasks import notifications


def test_notification_settings_reloads_current_configuration(monkeypatch) -> None:
    current = Settings(mini_app_url="https://current-host.example.com")
    monkeypatch.setattr(notifications, "Settings", lambda: current)

    assert notifications.notification_settings() is current


@pytest.mark.asyncio
async def test_reminder_job_ignores_stale_worker_settings(monkeypatch) -> None:
    stale = Settings(mini_app_url="https://obsolete.example.com")
    current = Settings(mini_app_url="https://current.example.com")
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
