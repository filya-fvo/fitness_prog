"""Audited administrator actions from the user detail card."""

from __future__ import annotations

import uuid
from html import escape
from typing import Any

import httpx
from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import Settings
from app.models.user import User
from app.schemas.admin import AdminActionResponse
from app.services import admin_audit, admin_users
from app.services.notification_prefs import merge_notification_settings
from app.services.telegram_bot import (
    TelegramBotError,
    send_app_notification,
    send_start_welcome,
    send_user_guide,
)

_CATEGORY_KEYS = ("measurements", "workouts", "supplements", "water", "calories")


def _mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def set_notification_categories(goals: dict[str, Any], enabled: bool) -> dict[str, Any]:
    updated = dict(goals)
    current = merge_notification_settings(_mapping(updated.get("notification_settings")))
    for key in _CATEGORY_KEYS:
        category = dict(current.get(key) or {})
        category["enabled"] = enabled
        current[key] = category
    updated["notification_settings"] = current
    return updated


async def set_notifications_enabled(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    enabled: bool,
    context: admin_audit.AuditContext,
) -> AdminActionResponse:
    user = await session.scalar(
        select(User)
        .where(User.id == user_id, User.is_deleted.is_(False))
        .with_for_update()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    user.goals = set_notification_categories(_mapping(user.goals), enabled)
    flag_modified(user, "goals")
    admin_audit.add_event(
        session,
        context=context,
        action=f"user.notifications.{'enable' if enabled else 'disable'}",
        object_type="user",
        object_id=user.id,
        result="success",
        description=f"Напоминания пользователя {'включены' if enabled else 'выключены'} по его запросу.",
        after=admin_audit.user_change_snapshot(channel="all", requested=True),
        notification_status="not_requested",
    )
    await session.commit()
    return AdminActionResponse(
        user_id=user.id,
        action="notifications_enabled" if enabled else "notifications_disabled",
        detail=f"Напоминания {'включены' if enabled else 'выключены'}.",
    )


async def _record_delivery_action(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    context: admin_audit.AuditContext,
    action: str,
    description: str,
    delivered: bool,
) -> None:
    delivery_status = "sent" if delivered else "failed"
    admin_audit.add_event(
        session,
        context=context,
        action=action,
        object_type="user",
        object_id=user_id,
        result="success" if delivered else "failure",
        description=description,
        after=admin_audit.user_change_snapshot(channel="telegram", requested=True),
        notification_status=delivery_status,
    )
    await admin_audit.record_notification_delivery(
        session,
        context=context,
        user_id=user_id,
        status=delivery_status,
        requested=True,
    )


async def send_service_message(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    text: str,
    settings: Settings,
    context: admin_audit.AuditContext,
) -> AdminActionResponse:
    user = await admin_users.get_user_or_404(session, user_id)
    if user.telegram_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram недоступен")
    delivered = False
    try:
        await send_app_notification(
            settings,
            telegram_id=int(user.telegram_id),
            title="Сообщение от поддержки",
            text=escape(text),
            startapp="home",
        )
        delivered = True
    except TelegramBotError as exc:
        logger.warning("admin_user_message_failed user={} err={}", user.id, exc)
    await _record_delivery_action(
        session,
        user_id=user.id,
        context=context,
        action="user.message.send",
        description=(
            "Служебное сообщение доставлено пользователю."
            if delivered
            else "Служебное сообщение не доставлено пользователю."
        ),
        delivered=delivered,
    )
    if not delivered:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Не удалось доставить сообщение")
    return AdminActionResponse(
        user_id=user.id, action="message_sent", notified=True, detail="Сообщение отправлено."
    )


async def resend_guide(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    kind: str,
    settings: Settings,
    context: admin_audit.AuditContext,
) -> AdminActionResponse:
    user = await admin_users.get_user_or_404(session, user_id)
    if user.telegram_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram недоступен")
    delivered = False
    try:
        if kind == "start":
            anthropometry = _mapping(user.anthropometry)
            first_name = str(
                anthropometry.get("first_name") or anthropometry.get("tg_first_name") or ""
            ).strip()[:80] or None
            await send_start_welcome(
                settings, chat_id=int(user.telegram_id), first_name=first_name
            )
        else:
            await send_user_guide(settings, chat_id=int(user.telegram_id))
        delivered = True
    except (TelegramBotError, httpx.HTTPError, ValueError) as exc:
        logger.warning("admin_user_guide_failed user={} kind={} err={}", user.id, kind, exc)
    await _record_delivery_action(
        session,
        user_id=user.id,
        context=context,
        action=f"user.guide.{kind}",
        description=(
            "Стартовые инструкции доставлены пользователю."
            if delivered
            else "Стартовые инструкции не доставлены пользователю."
        ),
        delivered=delivered,
    )
    if not delivered:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Не удалось отправить инструкцию")
    return AdminActionResponse(
        user_id=user.id,
        action=f"{kind}_sent",
        notified=True,
        detail="Инструкция отправлена.",
    )
