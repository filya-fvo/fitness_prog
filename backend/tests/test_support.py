from __future__ import annotations

import uuid
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.main import app
from app.models.support import SupportMessage, SupportTicket
from app.models.user import User
from app.schemas.support import SupportTicketCreate
from app.services import support_attachments
from app.services.telegram_bot import build_mini_app_open_url
from app.tasks import notifications
from app.tasks.notifications import WorkerSettings, send_support_reply_task


def test_support_contract_routes_and_migration() -> None:
    paths = app.openapi()["paths"]
    assert set(paths["/support/tickets"]) == {"get", "post"}
    assert set(paths["/support/tickets/{ticket_id}"]) == {"get"}
    assert set(paths["/support/tickets/{ticket_id}/messages"]) == {"post"}
    assert set(paths["/support/tickets/{ticket_id}/attachments"]) == {"post"}
    assert set(paths["/support/attachments/{attachment_id}"]) == {"get"}
    assert set(paths["/admin/support"]) == {"get"}
    assert set(paths["/admin/support/{ticket_id}/messages"]) == {"post"}
    assert "/feedback" not in paths
    assert send_support_reply_task in WorkerSettings.functions

    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260829000030_support_tickets.sql"
    ).read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS support_tickets" in migration
    assert "CREATE TABLE IF NOT EXISTS support_messages" in migration
    assert "idempotency_key UUID NOT NULL UNIQUE" in migration
    attachment_migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260829000031_support_attachments.sql"
    ).read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS support_attachments" in attachment_migration
    assert "image_data BYTEA NOT NULL" in attachment_migration
    assert "size_bytes BETWEEN 1 AND 8388608" in attachment_migration
    assert support_attachments.MAX_SCREENSHOTS_PER_TICKET == 5


@pytest.mark.asyncio
async def test_support_screenshot_routes_require_authentication() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        upload = await client.post(
            f"/support/tickets/{uuid.uuid4()}/attachments",
            data={"idempotency_key": str(uuid.uuid4())},
            files={"image": ("screen.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        )
        download = await client.get(f"/support/attachments/{uuid.uuid4()}")
    assert upload.status_code == 401
    assert download.status_code == 401


@pytest.mark.asyncio
async def test_support_screenshot_checks_magic_bytes_and_size() -> None:
    class Upload:
        def __init__(self, data: bytes, content_type: str):
            self.data = data
            self.content_type = content_type

        async def read(self, limit: int):
            return self.data[:limit]

    png = b"\x89PNG\r\n\x1a\n" + b"image-data"
    assert await support_attachments.read_screenshot(Upload(png, "image/png")) == (png, "image/png")
    with pytest.raises(support_attachments.SupportScreenshotError, match="unsupported_image"):
        await support_attachments.read_screenshot(Upload(b"not-an-image", "image/png"))
    oversized = b"\xff\xd8\xff" + b"0" * support_attachments.MAX_SCREENSHOT_BYTES
    with pytest.raises(support_attachments.SupportScreenshotError, match="image_too_large"):
        await support_attachments.read_screenshot(Upload(oversized, "image/jpeg"))


@pytest.mark.asyncio
async def test_support_ticket_rejects_more_than_five_screenshots() -> None:
    message = SupportMessage(id=uuid.uuid4(), ticket_id=uuid.uuid4(), author_type="user", body="Ошибка")

    class Session:
        responses = iter((None, message, support_attachments.MAX_SCREENSHOTS_PER_TICKET))

        async def scalar(self, _query):
            return next(self.responses)

    with pytest.raises(support_attachments.SupportScreenshotError, match="attachment_limit"):
        await support_attachments.attach_to_latest_user_message(
            Session(),
            ticket_id=message.ticket_id,
            user_id=uuid.uuid4(),
            idempotency_key=uuid.uuid4(),
            data=b"image",
            mime_type="image/png",
        )


def test_support_contract_rejects_unknown_category_and_too_short_message() -> None:
    base = {"client": "browser", "idempotency_key": uuid.uuid4()}
    with pytest.raises(ValidationError):
        SupportTicketCreate(category="sales", message="Нужна помощь", **base)
    with pytest.raises(ValidationError):
        SupportTicketCreate(category="question", message="?", **base)


def test_support_deep_link_opens_only_the_ticket_route() -> None:
    ticket_id = uuid.uuid4()
    url = build_mini_app_open_url(
        "https://app.filfitclub.ru",
        startapp=f"support_{ticket_id}",
    )
    assert url.startswith(f"https://app.filfitclub.ru/support/{ticket_id}?")
    assert f"startapp=support_{ticket_id}" in url


@pytest.mark.asyncio
async def test_support_notification_escapes_reply_and_updates_delivery(monkeypatch) -> None:
    ticket_id = uuid.uuid4()
    message = SupportMessage(
        id=uuid.uuid4(), ticket_id=ticket_id, author_type="admin", body="<b>Ответ</b>",
        idempotency_key=uuid.uuid4(), delivery_channel="telegram", delivery_status="pending",
    )
    ticket = SupportTicket(id=ticket_id, user_id=uuid.uuid4(), category="question", subject="Вопрос")
    user = User(id=ticket.user_id, telegram_id=123456)

    class Result:
        def one_or_none(self):
            return message, ticket, user

    class Session:
        commits = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _query):
            return Result()

        async def commit(self):
            self.commits += 1

    session = Session()
    captured: dict[str, object] = {}

    async def fake_send(_settings: Settings, **kwargs):
        captured.update(kwargs)
        return {"ok": True}

    async def fake_status(*_args, **_kwargs):
        return None

    monkeypatch.setattr(notifications, "AsyncSessionLocal", lambda: session)
    monkeypatch.setattr(notifications, "notification_settings", lambda: Settings(mini_app_url="https://app.filfitclub.ru"))
    monkeypatch.setattr(notifications, "send_app_notification", fake_send)
    monkeypatch.setattr(notifications, "_record_worker_status", fake_status)

    result = await send_support_reply_task({}, str(message.id))

    assert result == {"ok": True}
    assert captured["text"] == "&lt;b&gt;Ответ&lt;/b&gt;"
    assert captured["title"] == "Ответ поддержки Fitness Trainer"
    assert captured["startapp"] == f"support_{ticket_id}"
    assert message.delivery_status == "sent"
    assert message.delivered_at is not None
    assert session.commits == 1
