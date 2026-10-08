from __future__ import annotations

import uuid

import httpx
import pytest

from app.core.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models.user import User
from app.services.legal_documents import current_documents
from tests.test_legal_consent import accepted_body, legal_db as legal_db


@pytest.mark.asyncio
async def test_cannot_accept_for_another_user(legal_db):
    assert "/legal/accept" in app.openapi()["paths"], "Legal route is missing"
    owner = uuid.uuid4()
    async def session():
        yield legal_db
    async def identity():
        return User(id=owner)
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({get_db: session, get_current_user: identity})
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            payload = accepted_body().model_dump()
            rejected = await client.post("/legal/accept", json={**payload, "user_id": str(uuid.uuid4())})
            assert rejected.status_code == 422
            before = await client.get("/legal/status")
            assert before.json()["accepted"] is False
            accepted = await client.post("/legal/accept", json=payload)
            assert accepted.status_code == 200
            assert accepted.json()["user_id"] == str(owner)
            assert accepted.json()["accepted"] is True
            stale = accepted_body().model_dump()
            stale["documents"][0]["revision"] = "2020-01-01"
            assert (await client.post("/legal/accept", json=stale)).status_code == 409
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


@pytest.mark.asyncio
async def test_legal_accept_requires_auth_and_documents_are_public():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/legal/accept", json=accepted_body().model_dump())).status_code == 401
        doc = current_documents()[0]
        response = await client.get(f"/legal/documents/{doc.document_id}/{doc.revision}")
        assert response.status_code == 200
        assert response.json()["text"] == doc.text
        assert response.json()["text_sha256"] == doc.text_sha256
        assert (await client.get("/legal/documents/privacy/2020-01-01")).status_code == 404

@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["unchecked", "duplicate", "wrong_type"])
async def test_invalid_legal_choices_return_serializable_422_without_receipts(legal_db, invalid):
    owner = uuid.uuid4()
    async def session():
        yield legal_db
    async def identity():
        return User(id=owner)
    payload = accepted_body().model_dump()
    if invalid == "unchecked":
        payload["documents"][0]["accepted"] = False
    elif invalid == "duplicate":
        payload["documents"][1] = dict(payload["documents"][0])
    else:
        payload["documents"][0]["accepted"] = "true"
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({get_db: session, get_current_user: identity})
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
            rejected = await client.post("/legal/accept", json=payload)
            assert rejected.status_code == 422
            assert isinstance(rejected.json()["detail"], list)
            status = await client.get("/legal/status")
            assert status.json()["accepted"] is False
            assert all(document["accepted_at"] is None for document in status.json()["documents"])
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
