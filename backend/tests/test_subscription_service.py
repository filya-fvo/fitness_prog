"""Unit coverage for the FREE / PLUS entitlement domain."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest

from app.core.config import Settings
from app.models.user import User
from app.models.user_entitlement import UserEntitlement
from app.services.subscription_service import (
    grant_default_new_user_entitlement,
    grant_entitlement,
    has_entitlement,
    legacy_subscription_status,
    resolve_subscription_state,
    revoke_entitlement,
    transfer_entitlements,
)

NOW = datetime(2026, 9, 8, 8, 0, tzinfo=UTC)
USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000101")


def entitlement(
    *,
    source: str = "beta_grant",
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    revoked_at: datetime | None = None,
) -> UserEntitlement:
    return UserEntitlement(
        id=uuid.uuid4(),
        user_id=USER_ID,
        code="plus",
        source=source,
        starts_at=starts_at or NOW - timedelta(days=1),
        ends_at=ends_at,
        revoked_at=revoked_at,
        metadata_json={},
        created_at=NOW - timedelta(days=1),
        updated_at=NOW - timedelta(days=1),
    )


def test_no_active_entitlement_is_free() -> None:
    state = resolve_subscription_state([], at=NOW)

    assert state.model_dump() == {
        "tier": "free",
        "active": False,
        "sources": [],
        "valid_until": None,
    }
    assert legacy_subscription_status(state) == "free"


@pytest.mark.parametrize("source", ["beta_grant", "legacy_stars"])
def test_active_beta_and_legacy_grants_are_plus(source: str) -> None:
    state = resolve_subscription_state([entitlement(source=source)], at=NOW)

    assert state.tier == "plus"
    assert state.active is True
    assert state.sources == [source]
    assert state.valid_until is None
    assert legacy_subscription_status(state) == "pro_stars"


def test_future_expired_and_revoked_grants_are_inactive() -> None:
    grants = [
        entitlement(starts_at=NOW + timedelta(minutes=1)),
        entitlement(ends_at=NOW),
        entitlement(revoked_at=NOW - timedelta(minutes=1)),
    ]

    assert resolve_subscription_state(grants, at=NOW).tier == "free"


def test_one_active_grant_keeps_plus_when_another_is_revoked() -> None:
    state = resolve_subscription_state(
        [
            entitlement(source="beta_grant", revoked_at=NOW - timedelta(hours=1)),
            entitlement(source="qa", ends_at=NOW + timedelta(days=7)),
        ],
        at=NOW,
    )

    assert state.tier == "plus"
    assert state.sources == ["qa"]
    assert state.valid_until == NOW + timedelta(days=7)


def test_effective_expiry_covers_all_finite_active_grants() -> None:
    state = resolve_subscription_state(
        [
            entitlement(source="beta_grant", ends_at=NOW + timedelta(days=2)),
            entitlement(source="web_payment", ends_at=NOW + timedelta(days=30)),
        ],
        at=NOW,
    )

    assert state.sources == ["web_payment", "beta_grant"]
    assert state.valid_until == NOW + timedelta(days=30)


def test_unlimited_grant_makes_effective_expiry_unlimited() -> None:
    state = resolve_subscription_state(
        [
            entitlement(source="qa", ends_at=NOW + timedelta(days=1)),
            entitlement(source="legacy_stars"),
        ],
        at=NOW,
    )

    assert state.valid_until is None


@pytest.mark.asyncio
async def test_has_entitlement_uses_current_database_state() -> None:
    session = AsyncMock()
    session.scalar.side_effect = [uuid.uuid4(), None]

    assert await has_entitlement(session, USER_ID, "plus", at=NOW) is True
    assert await has_entitlement(session, USER_ID, "plus", at=NOW) is False


@pytest.mark.asyncio
async def test_grant_is_idempotent_for_equivalent_active_access() -> None:
    existing = entitlement(source="qa", ends_at=NOW + timedelta(days=7))
    session = AsyncMock()
    session.scalar.return_value = existing

    result, created = await grant_entitlement(
        session,
        user_id=USER_ID,
        code="plus",
        source="qa",
        starts_at=NOW,
        ends_at=NOW + timedelta(days=3),
    )

    assert result is existing
    assert created is False
    session.add.assert_not_called()
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_grant_creates_bounded_safe_record_without_committing() -> None:
    session = AsyncMock()
    session.scalar.return_value = None
    session.add = Mock()

    result, created = await grant_entitlement(
        session,
        user_id=USER_ID,
        code="plus",
        source="admin",
        starts_at=NOW,
        ends_at=NOW + timedelta(days=3),
        metadata={"reason_code": "manual_qa"},
    )

    assert created is True
    assert result.user_id == USER_ID
    assert result.metadata_json == {"reason_code": "manual_qa"}
    session.add.assert_called_once_with(result)
    session.flush.assert_awaited_once()
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_default_new_user_grant_can_be_disabled_by_configuration() -> None:
    session = AsyncMock()
    user = User(id=USER_ID, anthropometry={}, goals={})

    result, created = await grant_default_new_user_entitlement(
        session,
        user=user,
        settings=Settings(default_new_user_plus_source=""),
    )

    assert result is None
    assert created is False
    session.scalar.assert_not_awaited()
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_grant_rejects_sensitive_metadata_and_invalid_window() -> None:
    session = AsyncMock()
    with pytest.raises(ValueError, match="Sensitive"):
        await grant_entitlement(
            session,
            user_id=USER_ID,
            code="plus",
            source="qa",
            starts_at=NOW,
            metadata={"payment_token": "must-not-be-stored"},
        )
    with pytest.raises(ValueError, match="later"):
        await grant_entitlement(
            session,
            user_id=USER_ID,
            code="plus",
            source="qa",
            starts_at=NOW,
            ends_at=NOW,
        )
    with pytest.raises(ValueError, match="timezone"):
        await grant_entitlement(
            session,
            user_id=USER_ID,
            code="plus",
            source="qa",
            starts_at=datetime(2026, 9, 8, 8, 0),
        )


@pytest.mark.asyncio
async def test_revoke_is_scoped_and_idempotent() -> None:
    existing = entitlement(source="qa")
    session = AsyncMock()
    session.scalar.return_value = existing

    first = await revoke_entitlement(
        session,
        user_id=USER_ID,
        entitlement_id=existing.id,
        revoked_at=NOW,
    )
    second = await revoke_entitlement(
        session,
        user_id=USER_ID,
        entitlement_id=existing.id,
        revoked_at=NOW + timedelta(minutes=1),
    )

    assert first is existing and second is existing
    assert existing.revoked_at == NOW
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_account_merge_transfer_keeps_all_entitlement_rows() -> None:
    session = AsyncMock()

    await transfer_entitlements(
        session,
        source_user_id=uuid.UUID("00000000-0000-4000-8000-000000000201"),
        target_user_id=USER_ID,
    )

    session.execute.assert_awaited_once()
    session.commit.assert_not_awaited()


def test_migration_creates_domain_and_preserves_legacy_plus_only() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260908000043_user_entitlements.sql"
    ).read_text(encoding="utf-8")

    assert "CREATE TABLE IF NOT EXISTS user_entitlements" in migration
    assert "uq_user_entitlements_external_reference" in migration
    assert "users.subscription_status = 'pro_stars'" in migration
    assert "users.is_deleted IS FALSE" in migration
    assert "users.merged_into_user_id IS NULL" in migration
    assert "existing.source = 'legacy_stars'" in migration


def test_beta_rollout_migration_is_scoped_and_idempotent() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260908000044_grant_beta_plus.sql"
    ).read_text(encoding="utf-8")

    assert "users.is_deleted IS FALSE" in migration
    assert "users.merged_into_user_id IS NULL" in migration
    assert "active_access.revoked_at IS NULL" in migration
    assert "active_access.ends_at IS NULL OR active_access.ends_at > NOW()" in migration
    assert "'legacy_stars'" in migration
    assert "'beta_grant'" in migration
    assert "UPDATE USERS" not in migration.upper()
