from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from app.main import app
from app.routers.social import _analytics
from app.models.invite import Invite
from app.models.global_competition import GlobalCompetitionParticipant, GlobalCompetitionSeason
from app.models.social import Competition, CompetitionParticipant, Friendship
from app.models.user import User
from app.services import invite_service
from app.services.competition_analytics import (
    FactorDefinition,
    FactorResult,
    ParticipantAnalytics,
    assign_factor_wins,
    estimated_one_rep_max,
    improvement_percent,
)
from app.services.competition_scoring import RegularityScore, calculate_regularity_score, regularity_score
from app.services import global_competitions, social_service
from app.services.social_service import SocialConflictError, ordered_pair


def test_social_contract_and_append_only_migration() -> None:
    paths = app.openapi()["paths"]
    assert set(paths["/friends"]) == {"get"}
    assert set(paths["/competitions"]) == {"get"}
    assert set(paths["/competitions/friend"]) == {"post"}
    assert set(paths["/competitions/{competition_id}/accept"]) == {"post"}
    assert set(paths["/competitions/{competition_id}/leave"]) == {"post"}
    assert set(paths["/competitions/global/current"]) == {"get"}
    assert set(paths["/competitions/global/current/join"]) == {"post"}
    assert set(paths["/competitions/global/current/leave"]) == {"post"}
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

    global_migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260901000035_global_regularity_seasons.sql"
    ).read_text(encoding="utf-8")
    assert "uq_global_participant_user" in global_migration
    assert "ranked_eligible BOOLEAN NOT NULL" in global_migration
    assert "public_alias" in global_migration
    assert "telegram_id" not in global_migration

    custom_migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260901000036_custom_friend_competitions.sql"
    ).read_text(encoding="utf-8")
    assert "duration_days BETWEEN 7 AND 365" in custom_migration
    assert "jsonb_array_length(factors) BETWEEN 1 AND 4" in custom_migration
    assert "baseline JSONB NOT NULL" in custom_migration

    metric_fix_migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260902000037_fix_custom_competition_metric.sql"
    ).read_text(encoding="utf-8")
    assert "DROP CONSTRAINT IF EXISTS competitions_metric_check" in metric_fix_migration
    for metric in ("regularity", "weight_loss", "waist_reduction", "relative_strength", "custom"):
        assert f"'{metric}'" in metric_fix_migration

    model_constraint = next(
        constraint
        for constraint in Competition.__table__.constraints
        if constraint.name == "competitions_metric_check"
    )
    assert "custom" in str(model_constraint.sqltext)


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
            await client.get("/competitions/global/current"),
            await client.post("/competitions/global/current/join"),
            await client.post("/competitions/global/current/leave"),
        ]
    assert [response.status_code for response in responses] == [401] * 9


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
        async def execute(self, _query):
            class Rows:
                def all(self):
                    return [(user_id, day) for day in Scalars().all()]

            return Rows()

    score = await regularity_score(
        Session(),
        competition,
        participant,
        now=datetime(2026, 9, 3, 12, tzinfo=UTC),
    )

    assert score.completed == 1
    assert score.planned == 2
    assert score.score == 50.0


def test_global_season_window_cohorts_and_score_are_deterministic() -> None:
    now = datetime(2026, 9, 1, 12, tzinfo=UTC)
    window = global_competitions.current_season_window(now)
    assert window.season_key == "regularity-2026-08-31"
    assert window.start_date == date(2026, 8, 31)
    assert window.end_date == date(2026, 9, 27)
    assert window.join_deadline == date(2026, 9, 6)
    assert global_competitions.schedule_cohort({0, 4}) == "days_1_2"
    assert global_competitions.schedule_cohort({0, 2, 4}) == "days_3"
    assert global_competitions.schedule_cohort({0, 1, 3, 5}) == "days_4_plus"

    score = calculate_regularity_score(
        start_date=window.start_date,
        end_date=window.end_date,
        schedule_days=[0, 2, 4],
        local_day=date(2026, 9, 4),
        completed_dates=[date(2026, 8, 31), date(2026, 9, 1)],
    )
    assert score == RegularityScore(score=50.0, completed=1, planned=2)


def test_custom_competition_uses_relative_changes_instead_of_raw_kilograms() -> None:
    my_weight_loss, _ = improvement_percent(108, 98, decrease=True)
    wife_weight_loss, _ = improvement_percent(75, 65, decrease=True)
    assert my_weight_loss == 9.3
    assert wife_weight_loss == 13.3

    my_baseline = estimated_one_rep_max(80, 10) / 108
    my_latest = estimated_one_rep_max(110, 10) / 100
    friend_baseline = estimated_one_rep_max(90, 10) / 106
    friend_latest = estimated_one_rep_max(110, 5) / 95
    my_strength, _ = improvement_percent(my_baseline, my_latest)
    friend_strength, _ = improvement_percent(friend_baseline, friend_latest)
    assert my_strength == 48.5
    assert friend_strength == 19.3


def test_custom_competition_counts_factor_wins_without_mixing_percent_scales() -> None:
    weight = FactorDefinition("weight_loss", "weight_loss", "Снижение веса")
    strength = FactorDefinition("relative_strength:test", "relative_strength", "Сила")
    mine = ParticipantAnalytics(factors=[
        FactorResult(weight, "ready", value=9.3),
        FactorResult(strength, "ready", value=48.5),
    ])
    friend = ParticipantAnalytics(factors=[
        FactorResult(weight, "ready", value=13.3),
        FactorResult(strength, "ready", value=19.3),
    ])

    assert assign_factor_wins(mine, friend) == "tie"
    assert mine.wins == 1
    assert friend.wins == 1


def test_friend_analytics_never_exposes_raw_measurements() -> None:
    weight = FactorDefinition("weight_loss", "weight_loss", "Снижение веса")
    source = ParticipantAnalytics(factors=[FactorResult(
        definition=weight,
        status="ready",
        value=9.3,
        baseline_value=108,
        latest_value=98,
        baseline_date=date(2026, 9, 1),
        latest_date=date(2026, 10, 1),
        unit="кг",
    )])

    mine = _analytics(source, mine=True)
    theirs = _analytics(source, mine=False)
    assert mine is not None and mine.factors[0].baseline_value == 108
    assert theirs is not None and theirs.factors[0].value == 9.3
    assert theirs.factors[0].baseline_value is None
    assert theirs.factors[0].latest_value is None
    assert theirs.factors[0].unit is None


def test_global_ranking_requires_two_planned_days_and_preserves_ties() -> None:
    season_id = uuid.uuid4()
    first_id, second_id, provisional_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    participants = [
        GlobalCompetitionParticipant(
            season_id=season_id,
            user_id=first_id,
            public_alias="Участник BBBB",
            cohort="days_3",
            consented_at=datetime.now(UTC),
            schedule_days=[0, 2, 4],
            ranked_eligible=True,
        ),
        GlobalCompetitionParticipant(
            season_id=season_id,
            user_id=second_id,
            public_alias="Участник AAAA",
            cohort="days_3",
            consented_at=datetime.now(UTC),
            schedule_days=[0, 2, 4],
            ranked_eligible=True,
        ),
        GlobalCompetitionParticipant(
            season_id=season_id,
            user_id=provisional_id,
            public_alias="Участник CCCC",
            cohort="days_3",
            consented_at=datetime.now(UTC),
            schedule_days=[0, 2, 4],
            ranked_eligible=True,
        ),
    ]
    ranked = global_competitions.rank_scores(
        participants,
        {
            first_id: RegularityScore(100.0, 3, 3),
            second_id: RegularityScore(100.0, 2, 2),
            provisional_id: RegularityScore(100.0, 1, 1),
        },
    )
    assert [(item.participant.user_id, item.rank) for item in ranked] == [
        (first_id, 1),
        (second_id, 1),
    ]


@pytest.mark.asyncio
async def test_late_global_join_is_opt_in_but_not_ranked(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 9, 8, 12, tzinfo=UTC)
    user = User(
        id=uuid.uuid4(),
        goals={"notification_settings": {"workouts": {"days": [0, 2, 4]}}},
    )

    class Session:
        def __init__(self):
            self.scalar_values = iter((None, None, None))
            self.added: list[object] = []
            self.committed = False

        async def execute(self, _query):
            return None

        async def scalar(self, _query):
            return next(self.scalar_values)

        def add(self, item):
            self.added.append(item)

        async def flush(self):
            for item in self.added:
                if isinstance(item, GlobalCompetitionSeason) and item.id is None:
                    item.id = uuid.uuid4()

        async def commit(self):
            self.committed = True

    monkeypatch.setattr(global_competitions.secrets, "token_hex", lambda _size: "A1B2C3D4")
    session = Session()
    await global_competitions.join_current_season(session, user, now=now)

    participant = next(
        item for item in session.added if isinstance(item, GlobalCompetitionParticipant)
    )
    assert participant.public_alias == "Участник A1B2C3D4"
    assert participant.schedule_days == [0, 2, 4]
    assert participant.ranked_eligible is False
    assert session.committed is True
