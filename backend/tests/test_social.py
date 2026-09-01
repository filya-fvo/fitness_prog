from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from app.main import app
from app.models.invite import Invite
from app.models.social import Competition, CompetitionParticipant, Friendship
from app.models.user import User
from app.services import invite_service
from app.services.competition_scoring import regularity_score
from app.services import social_service
from app.services.social_service import SocialConflictError, ordered_pair


def test_social_contract_and_append_only_migration() -> None:
    paths = app.openapi()["paths"]
    assert set(paths["/friends"]) == {"get"}
    assert set(paths["/competitions"]) == {"get"}
    assert set(paths["/competitions/friend"]) == {"post"}
    assert set(paths["/competitions/{competition_id}/accept"]) == {"post"}
    assert set(paths["/competitions/{competition_id}/leave"]) == {"post"}
    assert set(paths["/friends/{friendship_id}/{action}"]) == {"post"}

    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260831000034_friend_competitions.sql"
    ).read_text(encoding="utf-8")
    assert "'referral_social'" in migration
    assert "CONSTRAINT uq_friendship_pair UNIQUE" in migration
    assert "duration_days IN (14, 28)" in migration
    assert "uq_competitions_open_friendship" in migration


@pytest.mark.asyncio
async def test_social_routes_require_authentication() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        responses = [
            await client.get("/friends"),
            await client.get("/competitions"),
            await client.post(
                "/competitions/friend",
                json={"friendship_id": str(uuid.uuid4()), "duration_days": 14},
            ),
            await client.post(f"/competitions/{uuid.uuid4()}/accept"),
            await client.post(f"/competitions/{uuid.uuid4()}/leave"),
            await client.post(f"/friends/{uuid.uuid4()}/block"),
        ]
    assert [response.status_code for response in responses] == [401] * 6


def test_social_invite_mode_depends_on_account_age_and_new_purpose() -> None:
    created = datetime(2026, 9, 1, 12, tzinfo=UTC)
    inviter_id = uuid.uuid4()
    invite = Invite(
        inviter_user_id=inviter_id,
        purpose="referral_social",
        token_hash="a" * 64,
        code_hash="b" * 64,
        expires_at=created + timedelta(days=14),
        created_at=created,
    )
    existing = User(id=uuid.uuid4(), created_at=created - timedelta(days=1))
    new_user = User(id=uuid.uuid4(), created_at=created + timedelta(seconds=1))

    assert invite_service._invite_mode(invite, existing) == "social"
    assert invite_service._invite_mode(invite, new_user) == "referral"
    invite.purpose = "referral"
    assert invite_service._invite_mode(invite, existing) == "referral"


def test_friendship_pair_is_stable_and_rejects_self_link() -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    assert ordered_pair(first, second) == ordered_pair(second, first)
    with pytest.raises(SocialConflictError):
        ordered_pair(first, first)


@pytest.mark.asyncio
async def test_link_offer_creates_friendship_and_starts_only_with_both_schedules() -> None:
    now = datetime(2026, 9, 1, 12, tzinfo=UTC)
    schedule = {
        "notification_settings": {
            "timezone": "Europe/Moscow",
            "workouts": {"days": [0, 2, 4]},
        }
    }
    inviter = User(id=uuid.uuid4(), username="first", goals=schedule)
    invitee = User(id=uuid.uuid4(), username="second", goals=schedule)

    class Rows:
        def all(self):
            return []

    class Session:
        def __init__(self):
            self.scalar_values = iter((None, None))
            self.added: list[object] = []
            self.pair_locked = False

        async def scalar(self, _query):
            return next(self.scalar_values)

        async def execute(self, _query):
            self.pair_locked = True

        async def scalars(self, _query):
            return Rows()

        def add(self, item):
            self.added.append(item)

        async def flush(self):
            for item in self.added:
                if isinstance(item, (Friendship, Competition)) and item.id is None:
                    item.id = uuid.uuid4()

    session = Session()
    result = await social_service.accept_link_offer(session, inviter, invitee, now=now)

    assert session.pair_locked is True
    assert result.friendship.status == "accepted"
    assert result.competition is not None
    assert result.competition.status == "active"
    assert result.competition.duration_days == 14
    assert result.competition.end_date == result.competition.start_date + timedelta(days=13)


@pytest.mark.asyncio
async def test_active_competition_accept_still_checks_membership() -> None:
    owner, friend, outsider = uuid.uuid4(), uuid.uuid4(), User(id=uuid.uuid4())
    friendship = Friendship(
        id=uuid.uuid4(),
        user_low_id=min(owner, friend),
        user_high_id=max(owner, friend),
        initiated_by_user_id=owner,
        status="accepted",
    )
    competition = Competition(
        id=uuid.uuid4(),
        friendship_id=friendship.id,
        created_by_user_id=owner,
        status="active",
        duration_days=14,
    )

    class Session:
        responses = iter((competition, friendship))

        async def scalar(self, _query):
            return next(self.responses)

    with pytest.raises(social_service.SocialPermissionError):
        await social_service.accept_competition(Session(), outsider, competition.id)


@pytest.mark.asyncio
async def test_manual_competition_requires_both_training_schedules() -> None:
    owner = User(
        id=uuid.uuid4(),
        goals={"notification_settings": {"workouts": {"days": [0, 2, 4]}}},
    )
    friend = User(
        id=uuid.uuid4(),
        goals={"notification_settings": {"workouts": {"days": []}}},
    )
    low, high = ordered_pair(owner.id, friend.id)
    friendship = Friendship(
        id=uuid.uuid4(),
        user_low_id=low,
        user_high_id=high,
        initiated_by_user_id=owner.id,
        status="accepted",
    )

    class Session:
        responses = iter((friendship, None, friend))

        async def scalar(self, _query):
            return next(self.responses)

    with pytest.raises(social_service.SocialScheduleError):
        await social_service.create_competition(Session(), owner, friendship.id, 14)


@pytest.mark.asyncio
async def test_regularity_score_counts_only_planned_training_dates() -> None:
    user_id = uuid.uuid4()
    competition = Competition(
        id=uuid.uuid4(),
        friendship_id=uuid.uuid4(),
        created_by_user_id=user_id,
        start_date=date(2026, 8, 31),  # Monday
        end_date=date(2026, 9, 13),
        duration_days=14,
    )
    participant = CompetitionParticipant(
        competition_id=competition.id,
        user_id=user_id,
        schedule_days=[0, 2, 4],
        timezone="Europe/Moscow",
    )

    class Scalars:
        def all(self):
            # Monday was completed; Tuesday is an extra workout and must not raise the score.
            return [date(2026, 8, 31), date(2026, 9, 1)]

    class Session:
        async def scalars(self, _query):
            return Scalars()

    score = await regularity_score(
        Session(),
        competition,
        participant,
        now=datetime(2026, 9, 3, 12, tzinfo=UTC),
    )

    assert score.completed == 1
    assert score.planned == 2
    assert score.score == 50.0
