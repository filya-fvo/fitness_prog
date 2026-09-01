from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from app.core.config import Settings
from app.main import app
from app.models.invite import Invite, InviteLookupAttempt, InviteRedemption, ReferralAttribution
from app.models.user import User
from app.services import invite_service
from app.services.social_service import SocialLinkResult
from app.models.social import Competition, Friendship


def _settings() -> Settings:
    return Settings(
        jwt_secret="test-secret-that-is-long-enough",
        mini_app_url="https://app.filfitclub.ru",
        bot_username="fil_fit_bot",
    )


def _invite(inviter_id: uuid.UUID, *, expired: bool = False) -> Invite:
    now = datetime.now(UTC)
    return Invite(
        id=uuid.uuid4(),
        inviter_user_id=inviter_id,
        purpose="referral",
        token_hash="a" * 64,
        code_hash="b" * 64,
        expires_at=now - timedelta(days=1) if expired else now + timedelta(days=1),
        max_uses=20,
        use_count=0,
    )


def test_invite_contract_and_append_only_migration() -> None:
    paths = app.openapi()["paths"]
    assert set(paths["/invites"]) == {"post"}
    assert set(paths["/invites/preview"]) == {"post"}
    assert set(paths["/invites/accept"]) == {"post"}
    assert set(paths["/invites/{invite_id}/revoke"]) == {"post"}

    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260831000033_referral_invites.sql"
    ).read_text(encoding="utf-8")
    assert "token_hash VARCHAR(64) NOT NULL UNIQUE" in migration
    assert "code_hash VARCHAR(64) NOT NULL UNIQUE" in migration
    assert "CONSTRAINT uq_invite_redemption_user UNIQUE (invite_id, user_id)" in migration
    assert "referred_user_id UUID NOT NULL UNIQUE" in migration
    assert "CHECK (inviter_user_id <> referred_user_id)" in migration
    assert "CREATE TABLE IF NOT EXISTS invite_lookup_attempts" in migration


@pytest.mark.asyncio
async def test_invite_routes_require_authentication() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        responses = [
            await client.post("/invites"),
            await client.post("/invites/preview", json={"value": "ABCD-EFGH"}),
            await client.post("/invites/accept", json={"value": "ABCD-EFGH"}),
            await client.post(f"/invites/{uuid.uuid4()}/revoke"),
        ]
    assert [response.status_code for response in responses] == [401, 401, 401, 401]


def test_invite_credentials_are_hashed_and_links_contain_only_random_token() -> None:
    settings = _settings()
    token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789"
    code_hash = invite_service.hash_invite_credential("ABCD-EFGH", settings, kind="code")
    same_code_hash = invite_service.hash_invite_credential("abcd efgh", settings, kind="code")
    token_hash = invite_service.hash_invite_credential(token, settings, kind="token")
    web_url, telegram_url = invite_service.build_invite_links(token, settings)

    assert code_hash == same_code_hash
    assert len(code_hash) == len(token_hash) == 64
    assert "ABCD" not in code_hash
    assert web_url == f"https://app.filfitclub.ru/invite?token={token}"
    assert telegram_url == f"https://t.me/fil_fit_bot?startapp=i_{token}"


@pytest.mark.asyncio
async def test_self_invite_is_rejected_before_any_attribution() -> None:
    user = User(id=uuid.uuid4(), username="owner")
    invite = _invite(user.id)

    class Session:
        async def scalar(self, _query):
            return invite

    with pytest.raises(invite_service.InviteSelfAcceptError):
        await invite_service.accept_invite(
            Session(), user, "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789", _settings()
        )


@pytest.mark.asyncio
async def test_accept_is_idempotent_even_after_invite_expiry() -> None:
    inviter = User(id=uuid.uuid4(), username="coach_friend")
    user = User(id=uuid.uuid4(), username="athlete")
    invite = _invite(inviter.id, expired=True)
    redemption = InviteRedemption(invite_id=invite.id, user_id=user.id, stage="accepted")

    class Session:
        responses = iter((invite, inviter, redemption))
        commits = 0

        async def scalar(self, _query):
            return next(self.responses)

        async def commit(self):
            self.commits += 1

    session = Session()
    result = await invite_service.accept_invite(
        session, user, "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789", _settings()
    )
    assert result.already_accepted is True
    assert result.inviter_label == "@coach_friend"
    assert session.commits == 0


@pytest.mark.asyncio
async def test_accept_creates_one_redemption_and_first_attribution() -> None:
    inviter = User(id=uuid.uuid4(), username=None)
    user = User(id=uuid.uuid4(), username="athlete")
    invite = _invite(inviter.id)

    class Session:
        responses = iter((invite, inviter, None, None))

        def __init__(self):
            self.added: list[object] = []
            self.commits = 0

        async def scalar(self, _query):
            return next(self.responses)

        def add(self, item):
            self.added.append(item)

        async def commit(self):
            self.commits += 1

    session = Session()
    result = await invite_service.accept_invite(
        session, user, "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789", _settings()
    )

    assert result.already_accepted is False
    assert result.inviter_label == "Пользователь Fitness Trainer"
    assert any(isinstance(item, InviteRedemption) for item in session.added)
    assert any(isinstance(item, ReferralAttribution) for item in session.added)
    assert invite.use_count == 1
    assert session.commits == 1


@pytest.mark.asyncio
async def test_short_code_lookup_is_durably_rate_limited() -> None:
    user_id = uuid.uuid4()

    class Session:
        def __init__(self):
            self.added: list[object] = []
            self.commits = 0

        async def scalar(self, _query):
            return 0

        def add(self, item):
            self.added.append(item)

        async def commit(self):
            self.commits += 1

    session = Session()
    await invite_service._record_short_code_attempt(
        session, user_id, "abcd-efgh", datetime.now(UTC)
    )

    assert len(session.added) == 1
    assert isinstance(session.added[0], InviteLookupAttempt)
    assert session.commits == 1


@pytest.mark.asyncio
async def test_existing_account_accepts_new_link_as_social_offer(monkeypatch) -> None:
    created = datetime(2026, 9, 1, 12, tzinfo=UTC)
    inviter = User(id=uuid.uuid4(), username="coach", created_at=created - timedelta(days=10))
    user = User(id=uuid.uuid4(), username="athlete", created_at=created - timedelta(days=5))
    invite = _invite(inviter.id)
    invite.purpose = "referral_social"
    invite.created_at = created
    friendship = Friendship(id=uuid.uuid4(), user_low_id=min(inviter.id, user.id), user_high_id=max(inviter.id, user.id), initiated_by_user_id=inviter.id)
    competition = Competition(id=uuid.uuid4(), friendship_id=friendship.id, created_by_user_id=inviter.id, duration_days=14)

    class Session:
        responses = iter((invite, inviter, None))

        def __init__(self):
            self.added: list[object] = []
            self.commits = 0

        async def scalar(self, _query):
            return next(self.responses)

        def add(self, item):
            self.added.append(item)

        async def commit(self):
            self.commits += 1

    async def link_offer(_session, _inviter, _invitee, *, now):
        assert now.tzinfo is not None
        return SocialLinkResult(friendship, competition)

    monkeypatch.setattr(invite_service.social_service, "accept_link_offer", link_offer)
    session = Session()
    result = await invite_service.accept_invite(
        session, user, "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789", _settings(), now=created
    )

    assert result.mode == "social"
    assert result.friendship_id == friendship.id
    assert result.competition_id == competition.id
    assert not any(isinstance(item, ReferralAttribution) for item in session.added)
    assert session.commits == 1
