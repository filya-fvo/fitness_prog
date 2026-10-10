"""Execute supplement upserts against a portable in-memory database."""

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import create_engine, select, update

from app.models.supplement_intake import SupplementIntake
from app.models.user import User
from app.services.supplement_intakes import ensure_day


class ScheduleSession:
    def __init__(self, connection):
        self.connection = connection

    async def execute(self, statement):
        return self.connection.execute(statement)

    async def commit(self):
        self.connection.commit()

    def item(self):
        return self.connection.execute(select(SupplementIntake.__table__)).one()


@pytest.fixture
def session():
    # The intake table has the same single unique schedule key on both dialects.
    engine = create_engine("sqlite://")
    with engine.connect() as connection:
        SupplementIntake.__table__.create(connection)
        yield ScheduleSession(connection)
    engine.dispose()


def user_with_schedule() -> User:
    return User(
        id=uuid.uuid4(),
        anthropometry={},
        goals={
            "workout_schedule": {"days": [0], "start_time": "08:45"},
            "workout_illness_periods": [{"started_on": "2026-09-29", "ended_on": None}],
            "supplements": [
                {
                    "id": "creatine",
                    "key": "creatine",
                    "name_ru": "Креатин",
                    "dose": "5 г",
                    "schedule": [
                        {"slot": "pre_workout", "days": "workout"},
                        {"slot": "08:00", "days": "rest"},
                    ],
                }
            ],
        },
    )


@pytest.mark.asyncio
async def test_ending_illness_reconciles_same_instant_pending_intake(session) -> None:
    user = user_with_schedule()
    day = date(2026, 10, 5)
    await ensure_day(session, user, day)
    original = session.item()
    user.goals["workout_illness_periods"][0]["ended_on"] = "2026-10-04"

    await ensure_day(session, user, day)
    await ensure_day(session, user, day)

    item = session.item()
    assert (item.days_mode, item.slot, item.status) == ("workout", "pre_workout", "pending")
    assert item.id == original.id
    assert item.notified_at is None


@pytest.mark.asyncio
async def test_same_instant_reconciliation_keeps_notification_claim_and_snooze(session) -> None:
    user = user_with_schedule()
    day = date(2026, 10, 5)
    await ensure_day(session, user, day)
    await session.execute(
        update(SupplementIntake).values(
            notified_at=datetime(2026, 10, 5, 5, 0, tzinfo=UTC),
            snoozed_until=datetime(2026, 10, 5, 5, 30, tzinfo=UTC),
        )
    )
    original = session.item()
    user.goals["workout_illness_periods"][0]["ended_on"] = "2026-10-04"

    await ensure_day(session, user, day)

    item = session.item()
    assert (item.days_mode, item.slot) == ("workout", "pre_workout")
    assert (item.id, item.notified_at, item.snoozed_until) == (
        original.id, original.notified_at, original.snoozed_until
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["taken", "skipped"])
async def test_same_instant_reconciliation_preserves_completed_intakes(session, status) -> None:
    user = user_with_schedule()
    day = date(2026, 10, 5)
    await ensure_day(session, user, day)
    await session.execute(
        update(SupplementIntake).values(
            status=status,
            completed_at=datetime(2026, 10, 5, 5, 0, tzinfo=UTC),
            source="app",
        )
    )
    original = session.item()
    user.goals["workout_illness_periods"][0]["ended_on"] = "2026-10-04"

    await ensure_day(session, user, day)

    assert session.item() == original


@pytest.mark.asyncio
async def test_overlapping_current_slots_preserve_first_slot_and_one_intake(session) -> None:
    user = user_with_schedule()
    user.goals["workout_illness_periods"][0]["ended_on"] = "2026-10-04"
    user.goals["supplements"][0]["schedule"] = [
        {"slot": "08:00", "days": "every"},
        {"slot": "pre_workout", "days": "workout"},
    ]

    await ensure_day(session, user, date(2026, 10, 5))
    await ensure_day(session, user, date(2026, 10, 5))

    item = session.item()
    assert (item.slot, item.days_mode) == ("08:00", "every")


def test_public_schedule_projection_is_pure():
    from copy import deepcopy
    from app.services.supplement_intakes import scheduled_rows

    user = user_with_schedule()
    original = deepcopy(user.goals)
    first = scheduled_rows(user, date(2026, 10, 5))
    second = scheduled_rows(user, date(2026, 10, 5))
    assert first == second
    assert first[0]["user_id"] == user.id
    assert user.goals == original
