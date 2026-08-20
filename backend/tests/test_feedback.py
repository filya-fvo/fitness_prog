"""Feedback delivery contract without real Redis or SMTP."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.models.user import User
from app.routers import feedback


def user_fixture() -> User:
    user = User(
        telegram_id=None,
        username="browser-user",
        auth_email="browser@example.test",
        anthropometry={},
        goals={},
    )
    user.id = uuid.uuid4()
    return user


async def test_browser_feedback_is_delivered_to_configured_admin_email(monkeypatch) -> None:
    captured: dict = {}

    async def no_quota(_user_id: str, _settings: Settings) -> None:
        return None

    async def send(**kwargs) -> bool:
        captured.update(kwargs)
        return True

    monkeypatch.setattr(feedback, "_consume_feedback_quota", no_quota)
    monkeypatch.setattr(feedback, "send_feedback_email", send)
    settings = Settings(
        admin_feedback_email="admin@example.test",
        smtp_from_email="sender@example.test",
        smtp_password="secret-for-test",
    )

    result = await feedback.submit_feedback(
        feedback.FeedbackCreate(
            message="Не открывается экран прогресса",
            page="/progress",
            client="browser",
            app_version="test",
        ),
        user_fixture(),
        settings,
    )

    assert result.accepted is True
    assert result.delivery == "email"
    assert captured["to_email"] == "admin@example.test"
    assert captured["context"]["Клиент"] == "browser"
    assert "browser@example.test" in captured["user_label"]


async def test_feedback_does_not_report_success_when_smtp_is_unavailable(monkeypatch) -> None:
    async def no_quota(_user_id: str, _settings: Settings) -> None:
        return None

    async def send(**_kwargs) -> bool:
        return False

    monkeypatch.setattr(feedback, "_consume_feedback_quota", no_quota)
    monkeypatch.setattr(feedback, "send_feedback_email", send)

    with pytest.raises(HTTPException) as exc_info:
        await feedback.submit_feedback(
            feedback.FeedbackCreate(message="Тест обратной связи"),
            user_fixture(),
            Settings(smtp_from_email="admin@example.test"),
        )

    assert exc_info.value.status_code == 503
