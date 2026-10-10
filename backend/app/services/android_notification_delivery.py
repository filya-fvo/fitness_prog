"""Row-locked Android selection and bounded idempotency receipts."""

from datetime import datetime
import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User
from app.schemas.android_notifications import AndroidDeliveryState, AndroidDeliveryUpdate
from app.services.android_notification_plan import build_android_notification_plan


def android_delivery_state(goals: dict) -> AndroidDeliveryState:
    raw = goals.get("android_notifications")
    if not isinstance(raw, dict):
        return AndroidDeliveryState()
    return AndroidDeliveryState(**{key: raw[key] for key in AndroidDeliveryState.model_fields if key in raw})


async def lock_notification_user(session: AsyncSession, user_id: UUID) -> User:
    user = await session.scalar(select(User).where(
        User.id == user_id, User.is_deleted.is_(False)
    ).with_for_update().execution_options(populate_existing=True))
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    return user


def disable_android_for_legacy(goals: dict, *, now: datetime) -> dict:
    current = android_delivery_state(goals)
    if not current.enabled:
        return goals
    raw = dict(goals.get("android_notifications") or {})
    raw.update(AndroidDeliveryState(
        enabled=False, device_id=None, revision=current.revision + 1, confirmed_at=now
    ).model_dump(mode="json"))
    return {**goals, "android_notifications": raw}


async def update_android_delivery(
    session: AsyncSession, user_id: UUID, body: AndroidDeliveryUpdate, *, now: datetime
) -> AndroidDeliveryState:
    user = await lock_notification_user(session, user_id)
    goals = dict(user.goals or {})
    raw = dict(goals.get("android_notifications") or {})
    receipts = list(raw.get("receipts") or [])
    payload_hash = hashlib.sha256(json.dumps(
        body.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    ).encode()).hexdigest()
    for receipt in receipts:
        if receipt["operation_id"] == str(body.operation_id):
            if receipt["payload_hash"] != payload_hash:
                raise HTTPException(409, "Эта операция уже использована для другого выбора")
            return AndroidDeliveryState.model_validate(receipt["result"])
    current = android_delivery_state(goals)
    if current.revision != body.expected_revision:
        raise HTTPException(409, "Способ доставки изменился. Обновите настройки")
    if body.enabled:
        plan = await build_android_notification_plan(session, user, now=now)
        if plan.settings_revision != body.expected_settings_revision:
            raise HTTPException(409, "Расписание изменилось. Подготовьте напоминания заново")
    selected = AndroidDeliveryState(
        enabled=body.enabled, device_id=body.device_id if body.enabled else None,
        revision=current.revision + 1, confirmed_at=now,
    )
    result = selected.model_dump(mode="json")
    receipts.append({"operation_id": str(body.operation_id), "payload_hash": payload_hash, "result": result})
    user.goals = {**goals, "android_notifications": {**result, "receipts": receipts[-32:]}}
    flag_modified(user, "goals")
    await session.commit()
    return selected
