"""Single source of truth for effective FREE / PLUS access."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.user import User
from app.models.user_entitlement import UserEntitlement
from app.schemas.subscription import (
    EntitlementCode,
    EntitlementSource,
    SubscriptionState,
)

ENTITLEMENT_CODES = frozenset({"plus"})
ENTITLEMENT_SOURCES = frozenset(
    {
        "beta_grant",
        "legacy_stars",
        "admin",
        "qa",
        "telegram_stars",
        "web_payment",
        "corporate",
        "promo",
        "partner",
    }
)
_SOURCE_PRIORITY = {
    "telegram_stars": 0,
    "web_payment": 1,
    "corporate": 2,
    "partner": 3,
    "promo": 4,
    "legacy_stars": 5,
    "admin": 6,
    "qa": 7,
    "beta_grant": 8,
}
_SENSITIVE_METADATA_FRAGMENTS = ("token", "password", "secret", "card", "otp")
_MAX_METADATA_BYTES = 4096


def utc_now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime, *, field: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} must include a timezone")
    return value.astimezone(UTC)


def _active_at(entitlement: UserEntitlement, moment: datetime) -> bool:
    return (
        entitlement.code == "plus"
        and entitlement.starts_at <= moment
        and entitlement.revoked_at is None
        and (entitlement.ends_at is None or entitlement.ends_at > moment)
    )


def resolve_subscription_state(
    entitlements: Iterable[UserEntitlement],
    *,
    at: datetime | None = None,
) -> SubscriptionState:
    """Resolve effective access from independent grants at one server timestamp."""

    moment = _as_utc(at, field="at") if at is not None else utc_now()
    active = [item for item in entitlements if _active_at(item, moment)]
    if not active:
        return SubscriptionState(tier="free", active=False)

    sources = sorted(
        {cast(EntitlementSource, item.source) for item in active},
        key=lambda source: (_SOURCE_PRIORITY.get(source, 999), source),
    )
    finite_ends = [item.ends_at for item in active if item.ends_at is not None]
    valid_until = None if len(finite_ends) != len(active) else max(finite_ends)
    return SubscriptionState(
        tier="plus",
        active=True,
        sources=sources,
        valid_until=valid_until,
    )


def legacy_subscription_status(state: SubscriptionState) -> str:
    """Map the new access model to the field understood by older clients."""

    return "pro_stars" if state.active else "free"


def _active_conditions(
    *,
    user_id: uuid.UUID,
    code: str,
    moment: datetime,
) -> tuple[object, ...]:
    return (
        UserEntitlement.user_id == user_id,
        UserEntitlement.code == code,
        UserEntitlement.starts_at <= moment,
        UserEntitlement.revoked_at.is_(None),
        (UserEntitlement.ends_at.is_(None) | (UserEntitlement.ends_at > moment)),
    )


async def get_active_entitlements(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    code: EntitlementCode = "plus",
    at: datetime | None = None,
) -> list[UserEntitlement]:
    moment = _as_utc(at, field="at") if at is not None else utc_now()
    rows = await session.scalars(
        select(UserEntitlement)
        .where(*_active_conditions(user_id=user_id, code=code, moment=moment))
        .order_by(UserEntitlement.starts_at, UserEntitlement.id)
    )
    return list(rows.all())


async def get_subscription_state(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    at: datetime | None = None,
) -> SubscriptionState:
    moment = _as_utc(at, field="at") if at is not None else utc_now()
    entitlements = await get_active_entitlements(session, user_id, at=moment)
    return resolve_subscription_state(entitlements, at=moment)


async def has_entitlement(
    session: AsyncSession,
    user_id: uuid.UUID,
    code: EntitlementCode,
    *,
    at: datetime | None = None,
) -> bool:
    moment = _as_utc(at, field="at") if at is not None else utc_now()
    entitlement_id = await session.scalar(
        select(UserEntitlement.id)
        .where(*_active_conditions(user_id=user_id, code=code, moment=moment))
        .limit(1)
    )
    return entitlement_id is not None


def _validate_grant(
    *,
    code: str,
    source: str,
    starts_at: datetime,
    ends_at: datetime | None,
    external_reference: str | None,
    metadata: Mapping[str, object] | None,
) -> dict[str, object]:
    if code not in ENTITLEMENT_CODES:
        raise ValueError("Unsupported entitlement code")
    if source not in ENTITLEMENT_SOURCES:
        raise ValueError("Unsupported entitlement source")
    _as_utc(starts_at, field="starts_at")
    if ends_at is not None:
        _as_utc(ends_at, field="ends_at")
    if ends_at is not None and ends_at <= starts_at:
        raise ValueError("Entitlement end must be later than its start")
    if external_reference is not None and not 1 <= len(external_reference) <= 255:
        raise ValueError("External reference is outside the allowed length")
    safe_metadata = dict(metadata or {})
    if any(
        fragment in str(key).lower()
        for key in safe_metadata
        for fragment in _SENSITIVE_METADATA_FRAGMENTS
    ):
        raise ValueError("Sensitive values are not allowed in entitlement metadata")
    try:
        encoded = json.dumps(safe_metadata, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError("Entitlement metadata must be valid JSON") from exc
    if len(encoded) > _MAX_METADATA_BYTES:
        raise ValueError("Entitlement metadata is too large")
    return safe_metadata


async def grant_entitlement(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    code: EntitlementCode,
    source: EntitlementSource,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    external_reference: str | None = None,
    metadata: Mapping[str, object] | None = None,
) -> tuple[UserEntitlement, bool]:
    """Add one grant without committing; equivalent active grants are idempotent."""

    start = _as_utc(starts_at, field="starts_at") if starts_at is not None else utc_now()
    end = _as_utc(ends_at, field="ends_at") if ends_at is not None else None
    safe_metadata = _validate_grant(
        code=code,
        source=source,
        starts_at=start,
        ends_at=end,
        external_reference=external_reference,
        metadata=metadata,
    )
    if external_reference is not None:
        statement = select(UserEntitlement).where(
            UserEntitlement.source == source,
            UserEntitlement.external_reference == external_reference,
        )
    else:
        statement = select(UserEntitlement).where(
            UserEntitlement.user_id == user_id,
            UserEntitlement.code == code,
            UserEntitlement.source == source,
            UserEntitlement.external_reference.is_(None),
            UserEntitlement.starts_at <= start,
            UserEntitlement.revoked_at.is_(None),
            (UserEntitlement.ends_at.is_(None) | (UserEntitlement.ends_at > start)),
        )
    existing = await session.scalar(statement.order_by(UserEntitlement.created_at.desc()).limit(1))
    if existing is not None:
        if existing.user_id != user_id or existing.code != code:
            raise ValueError("External reference is already assigned")
        return existing, False

    entitlement = UserEntitlement(
        user_id=user_id,
        code=code,
        source=source,
        starts_at=start,
        ends_at=end,
        external_reference=external_reference,
        metadata_json=safe_metadata,
    )
    session.add(entitlement)
    await session.flush()
    return entitlement, True


async def grant_default_new_user_entitlement(
    session: AsyncSession,
    *,
    user: User,
    settings: Settings,
) -> tuple[UserEntitlement | None, bool]:
    """Grant the configured initial access once; callers own the transaction."""

    source = settings.default_new_user_plus_source
    if not source:
        return None, False
    if user.id is None:
        raise ValueError("User must be flushed before granting initial access")
    return await grant_entitlement(
        session,
        user_id=user.id,
        code="plus",
        source=source,
        metadata={"grant_kind": "new_user_default"},
    )


async def revoke_entitlement(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    entitlement_id: uuid.UUID,
    revoked_at: datetime | None = None,
) -> UserEntitlement | None:
    """Revoke only the selected user's grant; repeated calls are idempotent."""

    entitlement = await session.scalar(
        select(UserEntitlement).where(
            UserEntitlement.id == entitlement_id,
            UserEntitlement.user_id == user_id,
        )
    )
    if entitlement is None:
        return None
    if entitlement.revoked_at is None:
        entitlement.revoked_at = (
            _as_utc(revoked_at, field="revoked_at") if revoked_at is not None else utc_now()
        )
        await session.flush()
    return entitlement


async def transfer_entitlements(
    session: AsyncSession,
    *,
    source_user_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> None:
    """Move all grants during an account merge without shortening or reviving them."""

    if source_user_id == target_user_id:
        return
    await session.execute(
        update(UserEntitlement)
        .where(UserEntitlement.user_id == source_user_id)
        .values(user_id=target_user_id)
    )
