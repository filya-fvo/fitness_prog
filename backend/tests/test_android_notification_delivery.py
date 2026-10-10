"""Delivery mode selection cannot replay over a newer user decision."""

from copy import deepcopy
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

from fastapi import HTTPException
import pytest

from app.models.user import User

NOW = datetime(2026, 10, 10, 7, tzinfo=UTC)
REVISION = "a" * 64


def fixture_user(monkeypatch):
    from app.services import android_notification_delivery as service
    user = User(id=uuid4(), goals={"unrelated": "keep", "notification_settings": {"delivery_channel": "telegram"}})
    session = AsyncMock()
    session.scalar.return_value = user
    monkeypatch.setattr(service, "build_android_notification_plan", AsyncMock(
        return_value=type("Plan", (), {"settings_revision": REVISION})()
    ))
    return service, user, session


def update(**kwargs):
    from app.schemas.android_notifications import AndroidDeliveryUpdate
    return AndroidDeliveryUpdate(**{
        "operation_id": uuid4(), "device_id": uuid4(), "enabled": True,
        "expected_revision": 0, "expected_settings_revision": REVISION, **kwargs,
    })


@pytest.mark.asyncio
async def test_replay_after_disable_returns_receipt_without_reenabling(monkeypatch):
    service, user, session = fixture_user(monkeypatch)
    first_body = update()
    first = await service.update_android_delivery(session, user.id, first_body, now=NOW)
    assert first.enabled and first.revision == 1
    disabled = await service.update_android_delivery(session, user.id, update(
        enabled=False, expected_revision=1, expected_settings_revision=None
    ), now=NOW)
    assert disabled.enabled is False and disabled.revision == 2
    original = deepcopy(user.goals)
    replay = await service.update_android_delivery(session, user.id, first_body, now=NOW)
    assert replay == first
    assert user.goals == original
    assert service.android_delivery_state(user.goals).enabled is False
    assert user.goals["notification_settings"]["delivery_channel"] == "telegram"
    assert user.goals["unrelated"] == "keep"
    assert session.commit.await_count == 2
    for call in session.scalar.await_args_list:
        assert "FOR UPDATE" in str(call.args[0])
        assert call.args[0].get_execution_options()["populate_existing"] is True


@pytest.mark.asyncio
async def test_replay_mismatch_stale_revision_and_32_receipt_bound(monkeypatch):
    service, user, session = fixture_user(monkeypatch)
    initial = update()
    await service.update_android_delivery(session, user.id, initial, now=NOW)
    with pytest.raises(HTTPException) as mismatch:
        await service.update_android_delivery(session, user.id, initial.model_copy(update={"device_id": uuid4()}), now=NOW)
    assert mismatch.value.status_code == 409
    with pytest.raises(HTTPException) as stale:
        await service.update_android_delivery(session, user.id, update(), now=NOW)
    assert stale.value.status_code == 409
    for revision in range(1, 33):
        await service.update_android_delivery(session, user.id, update(
            expected_revision=revision, enabled=False, expected_settings_revision=None
        ), now=NOW)
    assert len(user.goals["android_notifications"]["receipts"]) == 32
    before = deepcopy(user.goals)
    with pytest.raises(HTTPException) as evicted:
        await service.update_android_delivery(session, user.id, initial, now=NOW)
    assert evicted.value.status_code == 409
    assert user.goals == before


@pytest.mark.asyncio
async def test_changed_plan_or_missing_owner_never_enables(monkeypatch):
    service, user, session = fixture_user(monkeypatch)
    original = deepcopy(user.goals)
    with pytest.raises(HTTPException) as conflict:
        await service.update_android_delivery(session, user.id, update(expected_settings_revision="b" * 64), now=NOW)
    assert conflict.value.status_code == 409 and user.goals == original
    session.commit.assert_not_awaited()
    session.scalar.return_value = None
    with pytest.raises(HTTPException) as missing:
        await service.update_android_delivery(session, user.id, update(), now=NOW)
    assert missing.value.status_code == 404


def test_legacy_settings_stay_parseable_and_absent_means_disabled():
    from app.services.android_notification_delivery import android_delivery_state
    assert android_delivery_state({}).model_dump() == {
        "enabled": False, "device_id": None, "revision": 0, "confirmed_at": None
    }


@pytest.mark.asyncio
async def test_partial_patch_preserves_android_explicit_legacy_switch_disables(monkeypatch):
    service, user, session = fixture_user(monkeypatch)
    from app.routers.notifications import NotificationSettingsUpdate, get_settings_route, put_settings_route
    await service.update_android_delivery(session, user.id, update(), now=NOW)
    response = await get_settings_route(user=user)
    assert response.settings["delivery_channel"] == "telegram"
    assert response.android_delivery.enabled is True
    await put_settings_route(body=NotificationSettingsUpdate(settings={"quiet_hours": {"enabled": True}}), session=session, user=user)
    assert service.android_delivery_state(user.goals).revision == 1
    assert service.android_delivery_state(user.goals).enabled is True
    response = await put_settings_route(body=NotificationSettingsUpdate(settings={"delivery_channel": "browser"}), session=session, user=user)
    assert response.android_delivery.enabled is False
    assert response.android_delivery.revision == 2
    assert response.settings["delivery_channel"] == "browser"


@pytest.mark.asyncio
async def test_android_mode_suppresses_reminders_supplements_and_queued_timer(monkeypatch):
    service, user, session = fixture_user(monkeypatch)
    await service.update_android_delivery(session, user.id, update(), now=NOW)
    from app.core.config import Settings
    from app.routers import notifications as routes
    from app.tasks import notifications as worker
    from app.schemas.notifications import TimerNotifyRequest, TimerScheduleRequest
    send = AsyncMock()
    claims = AsyncMock()
    monkeypatch.setattr(routes, "send_app_notification", send)
    monkeypatch.setattr(routes, "send_user_web_push", send)
    monkeypatch.setattr(routes.supplement_intakes, "due_groups", claims)
    before = deepcopy(user.goals)
    result = await routes._dispatch_user(session, user, Settings(jwt_secret="test", bot_token="configured"))
    assert result == 0 and user.goals == before
    claims.assert_not_awaited()
    with pytest.raises(HTTPException) as test:
        await routes.send_test_notification(session=session, user=user, settings=Settings(jwt_secret="test"))
    assert test.value.status_code == 409
    for handler, body in [
        (routes.timer_ended_notify, TimerNotifyRequest(text="Готово")),
        (routes.schedule_timer_notification, TimerScheduleRequest(seconds=60, text="Готово")),
    ]:
        answer = await handler(body=body, user=user, settings=Settings(jwt_secret="test"), session=session)
        assert answer.ok is True
    class Context:
        async def __aenter__(self):
            return session
        async def __aexit__(self, *_args):
            pass
    monkeypatch.setattr(worker, "AsyncSessionLocal", Context)
    monkeypatch.setattr(worker, "send_app_notification", send)
    monkeypatch.setattr(worker, "send_user_web_push", send)
    answer = await worker.send_timer_finished_task({}, user_id=str(user.id), title="Отдых", text="Готово")
    assert answer["delivered"] == 0 and answer["ok"] is True
    send.assert_not_awaited()


def test_delivery_update_rejects_invalid_ids_or_missing_fingerprint():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        update(device_id="not-a-uuid")
    with pytest.raises(ValidationError):
        update(expected_settings_revision=None)
    with pytest.raises(ValidationError):
        update(expected_settings_revision="invalid")


@pytest.mark.asyncio
async def test_web_push_can_keep_owner_lock_until_caller_commit(monkeypatch):
    from app.services import web_push
    from app.core.config import Settings
    session = AsyncMock()
    session.scalars.return_value = []
    monkeypatch.setattr(web_push, "web_push_configured", lambda *_args: True)
    count = await web_push.send_user_web_push(
        session, Settings(jwt_secret="test"), user_id=uuid4(), title="Тест",
        body="Тест", url="/notifications", tag="test", commit=False,
    )
    assert count == 0
    session.commit.assert_not_awaited()
