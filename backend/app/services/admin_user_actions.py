"""Audited administrator actions from the user detail card."""

from __future__ import annotations

import uuid
import smtplib
from html import escape
from typing import Any

import httpx
from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import Settings
from app.models.supplement_intake import WebPushSubscription
from app.models.user import User
from app.schemas.admin import AdminActionResponse
from app.services import admin_audit, admin_users
from app.services.email_service import send_service_email
from app.services.notification_prefs import merge_notification_settings
from app.services.telegram_bot import (
    TelegramBotError,
    send_app_notification,
    send_start_welcome,
    send_user_guide,
)
from app.services.web_push import send_user_web_push

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
    channel: str = "telegram",
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
        after=admin_audit.user_change_snapshot(channel=channel, requested=True),
        notification_status=delivery_status,
    )
    await admin_audit.record_notification_delivery(
        session,
        context=context,
        user_id=user_id,
        status=delivery_status,
        requested=True,
        channel=channel,
    )


async def send_service_message(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    text: str,
    channel: str = "telegram",
    confirmed_user_consent: bool = False,
    settings: Settings,
    context: admin_audit.AuditContext,
) -> AdminActionResponse:
    user = await admin_users.get_user_or_404(session, user_id)
    delivered = False
    channel_label = {
        "telegram": "Telegram",
        "web_push": "Web Push",
        "email": "email",
    }.get(channel)
    if channel_label is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестный канал")
    try:
        if channel == "telegram":
            if user.telegram_id is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram недоступен")
            await send_app_notification(
                settings,
                telegram_id=int(user.telegram_id),
                title="Сообщение от поддержки",
                text=escape(text),
                startapp="home",
            )
            delivered = True
        elif channel == "web_push":
            if not confirmed_user_consent:
                raise HTTPException(status_code=400, detail="Нужно подтвердить согласие пользователя")
            active_push = await session.scalar(
                select(WebPushSubscription.id).where(
                    WebPushSubscription.user_id == user.id,
                    WebPushSubscription.disabled_at.is_(None),
                    WebPushSubscription.is_deleted.is_(False),
                )
            )
            if active_push is None:
                raise HTTPException(status_code=409, detail="Web Push не подключён")
            delivered = bool(
                await send_user_web_push(
                    session,
                    settings,
                    user_id=user.id,
                    title="Сообщение от поддержки",
                    body=text,
                    url="/",
                    tag=f"admin-message-{context.correlation_id}",
                )
            )
        else:
            if not confirmed_user_consent:
                raise HTTPException(status_code=400, detail="Нужно подтвердить согласие пользователя")
            service_settings = _mapping(
                merge_notification_settings(
                    _mapping(_mapping(user.goals).get("notification_settings"))
                ).get("service_messages")
            )
            if not user.auth_email:
                raise HTTPException(status_code=409, detail="Email не подключён")
            if not service_settings.get("email_enabled"):
                raise HTTPException(
                    status_code=409,
                    detail="Пользователь не разрешил служебные письма",
                )
            delivered = await send_service_email(
                settings=settings,
                to_email=user.auth_email,
                message=text,
            )
    except HTTPException:
        raise
    except (
        TelegramBotError,
        httpx.HTTPError,
        smtplib.SMTPException,
        OSError,
        ValueError,
        RuntimeError,
    ) as exc:
        logger.warning(
            "admin_user_message_failed user={} channel={} error_type={}",
            user.id,
            channel,
            type(exc).__name__,
        )
    await _record_delivery_action(
        session,
        user_id=user.id,
        context=context,
        action="user.message.send",
        description=(
            f"Служебное сообщение {'доставлено' if delivered else 'не доставлено'} "
            f"через {channel_label}."
        ),
        delivered=delivered,
        channel=channel,
    )
    if not delivered:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Не удалось доставить сообщение")
    return AdminActionResponse(
        user_id=user.id,
        action="message_sent",
        notified=True,
        detail=f"Сообщение отправлено через {channel_label}.",
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
