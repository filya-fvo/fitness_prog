"""Safety checks for the no-SQL FREE/PLUS QA contour."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.user_entitlement import UserEntitlement
from app.schemas.subscription import SubscriptionState
from app.services import admin_subscription
from app.services.admin_audit import AuditContext


class AdminSession:
    def __init__(self, *scalars: object) -> None:
        self.scalars = list(scalars)
        self.added: list[object] = []
        self.flushes = 0
        self.commits = 0

    async def scalar(self, _statement):
        return self.scalars.pop(0)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        self.flushes += 1

    async def commit(self) -> None:
        self.commits += 1


@pytest.mark.asyncio
async def test_grant_requires_confirmation_before_database_access() -> None:
    session = AdminSession()
    with pytest.raises(HTTPException) as exc:
        await admin_subscription.grant_test_plus(  # type: ignore[arg-type]
            session,
            uuid.uuid4(),
            duration_days=14,
            reason="free_mode_qa",
            confirmed=False,
            idempotency_key=uuid.uuid4(),
            context=AuditContext(uuid.uuid4(), uuid.uuid4()),
        )
    assert exc.value.status_code == 400
    assert session.scalars == []


@pytest.mark.asyncio
async def test_grant_is_bounded_idempotent_and_audited(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4())
    entitlement = UserEntitlement(
        id=uuid.uuid4(),
        user_id=user.id,
        code="plus",
        source="qa",
        starts_at=datetime.now(UTC),
        ends_at=datetime.now(UTC) + timedelta(days=14),
        metadata_json={"reason": "free_mode_qa"},
    )
    session = AdminSession(user)
    states = iter([
        SubscriptionState(tier="free", active=False),
        SubscriptionState(tier="plus", active=True, sources=["qa"]),
    ])

    async def fake_state(*_args, **_kwargs):
        return next(states)

    async def fake_grant(*_args, **kwargs):
        assert kwargs["source"] == "qa"
        assert kwargs["metadata"] == {"reason": "free_mode_qa"}
        assert kwargs["external_reference"].startswith("admin-qa:")
        delta = kwargs["ends_at"] - kwargs["starts_at"]
        assert timedelta(days=13, hours=23) < delta <= timedelta(days=14)
        return entitlement, True

    monkeypatch.setattr(admin_subscription, "get_subscription_state", fake_state)
    monkeypatch.setattr(admin_subscription, "grant_entitlement", fake_grant)
    result = await admin_subscription.grant_test_plus(  # type: ignore[arg-type]
        session,
        user.id,
        duration_days=14,
        reason="free_mode_qa",
        confirmed=True,
        idempotency_key=uuid.uuid4(),
        context=AuditContext(uuid.uuid4(), uuid.uuid4()),
    )

    assert result.action == "subscription_granted"
    assert session.commits == 1
    audit = session.added[-1]
    assert audit.action == "user.subscription.grant"
    assert audit.after_data["reason"] == "free_mode_qa"
    assert audit.after_data["entitlement_id"] == str(entitlement.id)


@pytest.mark.asyncio
async def test_revoke_protects_payment_and_legacy_sources() -> None:
    user = SimpleNamespace(id=uuid.uuid4())
    protected = UserEntitlement(
        id=uuid.uuid4(),
        user_id=user.id,
        code="plus",
        source="legacy_stars",
        starts_at=datetime.now(UTC) - timedelta(days=1),
        ends_at=None,
        metadata_json={},
    )
    session = AdminSession(user, protected)

    with pytest.raises(HTTPException) as exc:
        await admin_subscription.revoke_test_entitlement(  # type: ignore[arg-type]
            session,
            user.id,
            protected.id,
            reason="free_mode_qa",
            confirmed=True,
            context=AuditContext(uuid.uuid4(), uuid.uuid4()),
        )

    assert exc.value.status_code == 409
    assert protected.revoked_at is None
    assert session.commits == 0


@pytest.mark.asyncio
async def test_revoke_exact_beta_grant_can_make_user_free(monkeypatch) -> None:
    user = SimpleNamespace(id=uuid.uuid4())
    entitlement = UserEntitlement(
        id=uuid.uuid4(),
        user_id=user.id,
        code="plus",
        source="beta_grant",
        starts_at=datetime.now(UTC) - timedelta(days=1),
        ends_at=None,
        metadata_json={},
    )
    session = AdminSession(user, entitlement)
    states = iter([
        SubscriptionState(tier="plus", active=True, sources=["beta_grant"]),
        SubscriptionState(tier="free", active=False),
    ])

    async def fake_state(*_args, **_kwargs):
        return next(states)

    monkeypatch.setattr(admin_subscription, "get_subscription_state", fake_state)
    result = await admin_subscription.revoke_test_entitlement(  # type: ignore[arg-type]
        session,
        user.id,
        entitlement.id,
        reason="release_check",
        confirmed=True,
        context=AuditContext(uuid.uuid4(), uuid.uuid4()),
    )

    assert result.meta["effective_tier"] == "free"
    assert entitlement.revoked_at is not None
    assert session.flushes == 1
    assert session.commits == 1
    assert session.added[-1].action == "user.subscription.revoke"
