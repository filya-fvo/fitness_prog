"""Release routing and transport safety without real external messages."""
import importlib
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError


def service():
    return importlib.import_module("app.services.release_notices")


def delivery():
    return importlib.import_module("app.services.release_notice_delivery")


def user(channel="telegram", android=False, **kwargs):
    return SimpleNamespace(id=uuid4(), telegram_id=12, is_deleted=False, goals={
        "notification_settings": {"delivery_channel": channel},
        "android_notifications": {"enabled": android},
    }, **kwargs)


def test_selected_channel_android_priority_defaults_and_deleted():
    assert service().selected_channel(user()) == "telegram"
    assert service().selected_channel(user("browser")) == "browser"
    assert service().selected_channel(user("browser", android=True)) == "android"
    removed = user()
    removed.is_deleted = True
    assert service().selected_channel(removed) is None


def test_quiet_hours_use_user_timezone_and_cross_midnight():
    owner = user()
    owner.goals["notification_settings"].update({"timezone": "Europe/Moscow", "quiet_hours": {
        "enabled": True, "start_time": "22:00", "end_time": "08:00",
    }})
    assert service().external_delivery_quiet(owner, datetime(2026, 10, 29, 20, tzinfo=UTC))
    assert not service().external_delivery_quiet(owner, datetime(2026, 10, 29, 6, tzinfo=UTC))


def test_payload_is_bounded_plain_text_and_only_trusted_apk():
    schema = importlib.import_module("app.schemas.release_notice")
    payload = schema.ReleaseNoticePublish(release_key="apk-27", title="Обновление", message_text="• Новые цели", apk_version=27,
        apk_sha256="a" * 64, source_commit="b" * 40, shared_commit="c" * 40)
    assert payload.apk_url == "https://app.filfitclub.ru/android/latest.apk"
    for change in [{"message_text": "x" * 2001}, {"title": " "}, {"apk_version": 0},
                   {"apk_url": "https://evil.test/file.apk"}, {"release_key": "../../x"}]:
        with pytest.raises(ValidationError):
            schema.ReleaseNoticePublish(**{**payload.model_dump(), **change})
    assert service().content_hash(payload) != service().content_hash(payload.model_copy(update={"message_text": "Иное"}))


@pytest.mark.asyncio
async def test_telegram_escapes_changes_and_includes_download_link(monkeypatch):
    target = user()
    notice = SimpleNamespace(id=uuid4(), title="Обновление <27>", message_text="• Исправлено & сохранено", apk_url="https://app.filfitclub.ru/android/latest.apk")
    send = AsyncMock()
    monkeypatch.setattr(delivery(), "send_app_notification", send)
    outcome = await delivery().send_external(AsyncMock(), SimpleNamespace(), target, notice, "telegram")
    assert outcome == ("sent", None)
    args = send.await_args.kwargs
    assert args["title"] == "Обновление &lt;27&gt;"
    assert "&amp;" in args["text"]
    assert notice.apk_url in args["text"]


@pytest.mark.asyncio
async def test_browser_partial_or_unknown_outcome_never_claims_sent(monkeypatch):
    from app.core.config import Settings
    from app.models.supplement_intake import WebPushSubscription
    target, notice = user("browser"), SimpleNamespace(id=uuid4(), title="Обновление", message_text="Изменения", apk_url="https://app.filfitclub.ru/android/latest.apk")
    session = AsyncMock()
    session.scalar.return_value = 2
    monkeypatch.setattr(delivery(), "web_push_configured", lambda *args: True)
    monkeypatch.setattr(delivery(), "send_user_web_push", AsyncMock(return_value=1))
    assert await delivery().send_external(session, Settings(), target, notice, "browser") == ("partial", "browser_partial")
    statement = session.scalar.await_args.args[0]
    assert WebPushSubscription.__tablename__ in str(statement)
    monkeypatch.setattr(delivery(), "send_user_web_push", AsyncMock(side_effect=RuntimeError("after external send")))
    assert await delivery().send_external(session, Settings(), target, notice, "browser") == ("unknown", "transport_uncertain")


@pytest.mark.asyncio
async def test_missing_telegram_never_falls_back(monkeypatch):
    target = user()
    target.telegram_id = None
    tg, browser = AsyncMock(), AsyncMock()
    monkeypatch.setattr(delivery(), "send_app_notification", tg)
    monkeypatch.setattr(delivery(), "send_user_web_push", browser)
    assert await delivery().send_external(AsyncMock(), SimpleNamespace(), target, SimpleNamespace(), "telegram") == ("unavailable", "telegram_unavailable")
    tg.assert_not_awaited()
    browser.assert_not_awaited()


@pytest.mark.asyncio
async def test_unconfirmed_telegram_timeout_is_unknown_no_automatic_retry(monkeypatch):
    from app.services.telegram_bot import TelegramBotError
    monkeypatch.setattr(delivery(), "send_app_notification", AsyncMock(side_effect=TelegramBotError("Telegram transport error: timeout")))
    notice = SimpleNamespace(title="Новая версия", message_text="Изменения", apk_url="https://app.filfitclub.ru/android/latest.apk")
    assert await delivery().send_external(AsyncMock(), SimpleNamespace(), user(), notice, "telegram") == ("unknown", "telegram_transport")


@pytest.mark.asyncio
async def test_endpoint_requires_authentication():
    from app.main import app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/notifications/release-notices")
        assert response.status_code in {401, 403}
        assert (await client.post(f"/notifications/release-notices/{uuid4()}/seen")).status_code in {401, 403}

def test_web_push_release_text_fits_transport_payload():
    schema = importlib.import_module("app.schemas.release_notice")
    with pytest.raises(ValidationError):
        schema.ReleaseNoticePublish(release_key="apk-27", title="Обновление", message_text="🏋" * 1000,
            apk_version=27, apk_sha256="a" * 64, source_commit="b" * 40, shared_commit="c" * 40)
