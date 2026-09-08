"""Audited and narrowly scoped administrator controls for test PLUS access."""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_entitlement import UserEntitlement
from app.schemas.admin import AdminActionResponse
from app.schemas.admin_user import AdminEntitlementReason
from app.services import admin_audit
from app.services.subscription_service import (
    get_subscription_state,
    grant_entitlement,
    utc_now,
)

REVOCABLE_ADMIN_SOURCES = frozenset({"beta_grant", "qa", "admin"})
_REASON_LABELS: dict[AdminEntitlementReason, str] = {
    "free_mode_qa": "проверка режима FREE",
    "release_check": "проверка релиза",
    "support_reproduction": "воспроизведение обращения",
}


async def _locked_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.scalar(
        select(User)
        .where(User.id == user_id, User.is_deleted.is_(False))
        .with_for_update()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )
    return user


def _require_confirmation(confirmed: bool) -> None:
    if not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подтвердите изменение тарифа",
        )


async def grant_test_plus(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    duration_days: int,
    reason: AdminEntitlementReason,
    confirmed: bool,
    idempotency_key: uuid.UUID,
    context: admin_audit.AuditContext,
) -> AdminActionResponse:
    """Grant only a bounded QA entitlement; retries reuse the same record."""

    _require_confirmation(confirmed)
    if not 1 <= duration_days <= 365:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Срок тестового доступа должен быть от 1 до 365 дней",
        )
    user = await _locked_user(session, user_id)
    before = await get_subscription_state(session, user.id)
    start = utc_now()
    end = start + timedelta(days=duration_days)
    try:
        entitlement, created = await grant_entitlement(
            session,
            user_id=user.id,
            code="plus",
            source="qa",
            starts_at=start,
            ends_at=end,
            external_reference=f"admin-qa:{idempotency_key}",
            metadata={"reason": reason},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот запрос уже использован для другого права",
        ) from exc

    if not created:
        return AdminActionResponse(
            user_id=user.id,
            action="subscription_grant_unchanged",
            detail="PLUS уже был выдан этим запросом.",
            meta={"entitlement_id": str(entitlement.id), "created": False},
        )

    after = await get_subscription_state(session, user.id)
    admin_audit.add_event(
        session,
        context=context,
        action="user.subscription.grant",
        object_type="user",
        object_id=user.id,
        result="success",
        description=f"Выдан тестовый PLUS: {_REASON_LABELS[reason]}.",
        before=admin_audit.subscription_change_snapshot(tier=before.tier),
        after=admin_audit.subscription_change_snapshot(
            tier=after.tier,
            source=entitlement.source,
            entitlement_id=entitlement.id,
            starts_at=entitlement.starts_at,
            ends_at=entitlement.ends_at,
            reason=reason,
        ),
        notification_status="not_requested",
    )
    await session.commit()
    return AdminActionResponse(
        user_id=user.id,
        action="subscription_granted",
        detail=f"Тестовый PLUS выдан на {duration_days} дн.",
        meta={"entitlement_id": str(entitlement.id), "created": True},
    )


async def revoke_test_entitlement(
    session: AsyncSession,
    user_id: uuid.UUID,
    entitlement_id: uuid.UUID,
    *,
    reason: AdminEntitlementReason,
    confirmed: bool,
    context: admin_audit.AuditContext,
) -> AdminActionResponse:
    """Revoke one selected test-controlled source without touching any other grant."""

    _require_confirmation(confirmed)
    user = await _locked_user(session, user_id)
    entitlement = await session.scalar(
        select(UserEntitlement)
        .where(
            UserEntitlement.id == entitlement_id,
            UserEntitlement.user_id == user.id,
        )
        .with_for_update()
    )
    if entitlement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Право не найдено")
    if entitlement.source not in REVOCABLE_ADMIN_SOURCES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот источник доступа защищён от отзыва в QA-контуре",
        )
    if entitlement.revoked_at is not None:
        return AdminActionResponse(
            user_id=user.id,
            action="subscription_revoke_unchanged",
            detail="Это право уже было отозвано.",
            meta={"entitlement_id": str(entitlement.id), "revoked": False},
        )

    now = utc_now()
    if entitlement.starts_at > now or (
        entitlement.ends_at is not None and entitlement.ends_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Можно отозвать только действующее право",
        )
    before = await get_subscription_state(session, user.id)
    entitlement.revoked_at = now
    await session.flush()
    after = await get_subscription_state(session, user.id)
    admin_audit.add_event(
        session,
        context=context,
        action="user.subscription.revoke",
        object_type="user",
        object_id=user.id,
        result="success",
        description=f"Отозван выбранный источник PLUS: {_REASON_LABELS[reason]}.",
        before=admin_audit.subscription_change_snapshot(
            tier=before.tier,
            source=entitlement.source,
            entitlement_id=entitlement.id,
        ),
        after=admin_audit.subscription_change_snapshot(
            tier=after.tier,
            source=entitlement.source,
            entitlement_id=entitlement.id,
            reason=reason,
        ),
        notification_status="not_requested",
    )
    await session.commit()
    return AdminActionResponse(
        user_id=user.id,
        action="subscription_revoked",
        detail="Выбранное право PLUS отозвано.",
        meta={
            "entitlement_id": str(entitlement.id),
            "revoked": True,
            "effective_tier": after.tier,
        },
    )
