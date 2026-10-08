from __future__ import annotations

import importlib
import importlib.util
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.schemas.legal import LegalAcceptRequest
from app.services.legal_documents import current_documents


def implementation():
    assert importlib.util.find_spec("app.services.legal_consent") is not None, "Server legal acceptance is missing"
    return importlib.import_module("app.services.legal_consent")


def accepted_body():
    return LegalAcceptRequest(documents=[dict(document_id=doc.document_id, revision=doc.revision, text_sha256=doc.text_sha256, accepted=True) for doc in current_documents()])


class AsyncTestSession:
    """Exercise actual SQL and uniqueness via SQLite, without external services."""
    def __init__(self, session):
        self.session = session

    async def execute(self, *args, **kwargs):
        return self.session.execute(*args, **kwargs)

    async def commit(self):
        self.session.commit()

    async def rollback(self):
        self.session.rollback()

    async def flush(self):
        self.session.flush()


@pytest.fixture
def legal_db():
    if importlib.util.find_spec("app.services.legal_consent") is None:
        yield None
        return
    from app.models.legal_acceptance import LegalAcceptance
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE users (id UUID PRIMARY KEY)")
        LegalAcceptance.__table__.create(conn)
    with Session(engine) as session:
        yield AsyncTestSession(session)
    engine.dispose()


@pytest.mark.asyncio
async def test_existing_user_starts_unaccepted(legal_db):
    status = await implementation().get_legal_status(legal_db, uuid.uuid4())
    assert not status.accepted
    assert len(status.documents) == 3
    assert all(doc.accepted_at is None for doc in status.documents)


@pytest.mark.asyncio
async def test_all_three_receipts_are_independent_and_repeat_is_idempotent(legal_db):
    implementation()
    from app.models.legal_acceptance import LegalAcceptance
    owner = uuid.uuid4()
    service = implementation()
    status = await service.accept_documents(legal_db, owner, accepted_body())
    assert status.user_id == owner and status.accepted
    original = list(legal_db.session.scalars(select(LegalAcceptance)))
    assert {row.document_id for row in original} == {"privacy", "consent", "offer"}
    first_times = {row.document_id: row.accepted_at for row in original}
    await service.accept_documents(legal_db, owner, accepted_body())
    rows = list(legal_db.session.scalars(select(LegalAcceptance)))
    assert len(rows) == 3
    assert {row.document_id: row.accepted_at for row in rows} == first_times
    assert not (await service.get_legal_status(legal_db, uuid.uuid4())).accepted


@pytest.mark.asyncio
async def test_stale_hash_rejected_without_any_receipt(legal_db):
    implementation()
    from app.models.legal_acceptance import LegalAcceptance
    body = accepted_body()
    body.documents[0].text_sha256 = "f" * 64
    with pytest.raises(HTTPException) as failure:
        await implementation().accept_documents(legal_db, uuid.uuid4(), body)
    assert failure.value.status_code == 409
    assert list(legal_db.session.scalars(select(LegalAcceptance))) == []


@pytest.mark.asyncio
async def test_conflicting_persisted_hash_does_not_become_accepted(legal_db):
    implementation()
    from app.models.legal_acceptance import LegalAcceptance
    owner = uuid.uuid4()
    legal_db.session.add(LegalAcceptance(user_id=owner, document_id="privacy", revision="2026-10-08", text_sha256="f" * 64, accepted_at=datetime.now(timezone.utc)))
    legal_db.session.commit()
    with pytest.raises(HTTPException) as failure:
        await implementation().accept_documents(legal_db, owner, accepted_body())
    assert failure.value.status_code == 409
    assert not (await implementation().get_legal_status(legal_db, owner)).accepted


@pytest.mark.parametrize("alter", ["false", "duplicate", "missing", "foreign_owner", "integer_true"])
def test_false_duplicate_missing_or_foreign_payload_rejected(alter):
    payload = accepted_body().model_dump()
    if alter == "false":
        payload["documents"][0]["accepted"] = False
    if alter == "integer_true":
        payload["documents"][0]["accepted"] = 1
    if alter == "duplicate":
        payload["documents"][1] = payload["documents"][0]
    if alter == "missing":
        payload["documents"].pop()
    if alter == "foreign_owner":
        payload["user_id"] = str(uuid.uuid4())
    with pytest.raises(ValidationError):
        LegalAcceptRequest.model_validate(payload)


@pytest.mark.asyncio
async def test_auth_and_profile_return_same_owner_receipts(legal_db, monkeypatch):
    from app.models.user import User
    from app.routers.auth import _user_response
    from app.schemas.subscription import SubscriptionState
    from app.services import user_service
    owner = uuid.uuid4()
    async def subscription(*args):
        return SubscriptionState(tier="free", active=False)
    monkeypatch.setattr(user_service, "get_subscription_state", subscription)
    await implementation().accept_documents(legal_db, owner, accepted_body())
    user = User(id=owner, anthropometry={}, goals={"onboarding_completed": True}, stars_balance=0)
    profile = await user_service.to_profile(legal_db, user)
    assert profile.legal_status.accepted
    assert _user_response(profile).legal_status == profile.legal_status
    assert user.goals == {"onboarding_completed": True}
