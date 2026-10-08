from __future__ import annotations
import importlib
import importlib.util
import hashlib
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


class AsyncTestSession:
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

    def add(self, value):
        self.session.add(value)

    def get_bind(self):
        return self.session.get_bind()


def service():
    assert importlib.util.find_spec("app.services.android_login"), (
        "Native Telegram handshake missing"
    )
    return importlib.import_module("app.services.android_login")


@pytest.fixture
def db():
    if not importlib.util.find_spec("app.services.android_login"):
        yield None
        return
    from app.models.android_login import AndroidLogin

    engine = create_engine("sqlite:///:memory:")
    AndroidLogin.__table__.create(engine)
    with Session(engine) as session:
        yield AsyncTestSession(session)
    engine.dispose()


VERIFIER = "v" * 43
ACTOR = {"id": 123456789, "first_name": "Тест", "username": "test_user"}


def challenge():
    return hashlib.sha256(VERIFIER.encode()).hexdigest()


async def begin(db):
    return await service().start_login(db, challenge(), "fitness_test_bot", "a" * 64)


def token(result):
    return result["bot_url"].split("android_login_")[1]


@pytest.mark.asyncio
async def test_start_link_does_not_authenticate_without_explicit_confirmation(db):
    s = service()
    result = await begin(db)
    assert len("android_login_" + token(result)) <= 64
    assert (await s.login_status(db, result["request_id"], VERIFIER))["state"] == "waiting"
    assert await s.claim_login(db, token(result), ACTOR)
    assert (await s.login_status(db, result["request_id"], VERIFIER))["state"] == "waiting"
    assert await s.approve_login(db, token(result), ACTOR["id"])
    status = await s.login_status(db, result["request_id"], VERIFIER)
    assert status == {"state": "ready", "display_name": "Тест (@test_user)"}
    identity = await s.consume_login(db, result["request_id"], VERIFIER)
    assert identity.id == ACTOR["id"]
    with pytest.raises(Exception) as failure:
        await s.consume_login(db, result["request_id"], VERIFIER)
    assert failure.value.status_code == 410


@pytest.mark.asyncio
async def test_stolen_link_cannot_poll_or_exchange_and_actor_cannot_change(db):
    s = service()
    r = await begin(db)
    with pytest.raises(Exception) as e:
        await s.login_status(db, r["request_id"], "x" * 43)
    assert e.value.status_code == 410
    assert await s.claim_login(db, token(r), ACTOR)
    assert not await s.claim_login(db, token(r), {**ACTOR, "id": 999})
    assert not await s.approve_login(db, token(r), 999)
    with pytest.raises(Exception) as e:
        await s.consume_login(db, r["request_id"], VERIFIER)
    assert e.value.status_code == 410


@pytest.mark.asyncio
async def test_expired_and_cancelled_requests_never_issue_identity(db):
    s = service()
    r = await begin(db)
    await s.cancel_login(db, r["request_id"], VERIFIER)
    assert not await s.claim_login(db, token(r), ACTOR)
    with pytest.raises(Exception):
        await s.consume_login(db, r["request_id"], VERIFIER)
    r = await begin(db)
    from app.models.android_login import AndroidLogin

    db.session.get(AndroidLogin, r["request_id"]).expires_at = datetime.now(
        timezone.utc
    ) - timedelta(seconds=1)
    db.session.commit()
    assert not await s.claim_login(db, token(r), ACTOR)


@pytest.mark.asyncio
async def test_start_rate_bounded_and_no_raw_link_or_verifier_persisted(db):
    service()
    from app.models.android_login import AndroidLogin

    r = await begin(db)
    row = db.session.get(AndroidLogin, r["request_id"])
    assert token(r) not in str(row.__dict__) and VERIFIER not in str(row.__dict__)
    for _ in range(4):
        await begin(db)
    with pytest.raises(Exception) as e:
        await begin(db)
    assert e.value.status_code == 429


@pytest.mark.parametrize(
    "invalid",
    [
        {
            "message": {
                "chat": {"type": "group", "id": 123},
                "from": {"id": 123},
                "text": "/start android_login_" + "x" * 43,
            }
        },
        {
            "edited_message": {
                "chat": {"type": "private", "id": 123},
                "from": {"id": 123},
                "text": "/start android_login_" + "x" * 43,
            }
        },
        {
            "message": {
                "chat": {"type": "private", "id": 123},
                "from": {"id": 999},
                "text": "/start android_login_" + "x" * 43,
            }
        },
        {
            "message": {
                "chat": {"type": "private", "id": 123},
                "from": {"id": 123, "is_bot": True},
                "text": "/start android_login_" + "x" * 43,
            }
        },
    ],
)
def test_auth_update_requires_private_original_same_actor(invalid):
    service()
    handler = importlib.import_module("app.services.telegram_android_login")
    assert handler.parse_login_update(invalid) is None


@pytest.mark.asyncio
async def test_http_exchange_reuses_existing_account_and_secret_gate(db, monkeypatch):
    from types import SimpleNamespace
    import uuid
    import httpx
    from app.main import app
    from app.core.config import Settings, get_settings
    from app.core.database import get_db
    from app.routers import android_auth

    service()
    settings = Settings(
        bot_token="fake",
        bot_username="fitness_test_bot",
        jwt_secret="test-only-secret",
        telegram_webhook_secret="private-test-secret",
        environment="test",
    )
    owner = uuid.uuid4()

    async def database():
        yield db

    async def authenticate(session, actor, settings):
        assert actor.id == ACTOR["id"]
        return SimpleNamespace(id=owner), "test-access-token"

    async def profile(session, user):
        assert user.id == owner
        return SimpleNamespace(
            id=owner,
            telegram_id=ACTOR["id"],
            username="test_user",
            auth_email=None,
            subscription={"tier": "free", "active": False},
            subscription_status="free",
            onboarding_completed=True,
            legal_status=None,
            goals={},
        )

    monkeypatch.setattr(android_auth, "authenticate_telegram_user", authenticate)
    monkeypatch.setattr(android_auth, "to_profile", profile)
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/auth/android/telegram/start", json={"challenge": challenge()}
            )
            assert response.status_code == 200
            started = response.json()
            body = {"request_id": started["request_id"], "verifier": VERIFIER}
            early = await client.post("/auth/android/telegram/exchange", json=body)
            assert early.status_code == 410
            await service().claim_login(db, token(started), ACTOR)
            await service().approve_login(db, token(started), ACTOR["id"])
            result = await client.post("/auth/android/telegram/exchange", json=body)
            assert result.status_code == 200
            assert result.json()["user"]["id"] == str(owner)
            assert result.json()["user"]["auth_email"] is None
            assert (
                await client.post("/auth/android/telegram/exchange", json=body)
            ).status_code == 410
            forged = await client.post(
                "/telegram/webhook",
                json={
                    "message": {
                        "chat": {"type": "private", "id": 123},
                        "from": {"id": 123},
                        "text": "/start android_login_" + "x" * 43,
                    }
                },
            )
            assert forged.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_invalid_native_proof_is_not_returned_or_logged(monkeypatch):
    import httpx
    from loguru import logger
    from app.main import app

    secret = "PRIVATE_VERIFIER_MUST_NOT_LEAK!"
    events = []
    sink = logger.add(lambda message: events.append(str(message)))
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/auth/android/telegram/status", json={"request_id": "bad", "verifier": secret}
            )
            assert response.status_code == 422
            assert secret not in response.text
            assert secret not in "".join(events)
    finally:
        logger.remove(sink)
