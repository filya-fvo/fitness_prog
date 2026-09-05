"""Server-side profile validation cannot be bypassed by a custom API client."""

import uuid
from datetime import date

import pytest
from pydantic import ValidationError

from app.models.user import User
from app.schemas.user import UserProfileUpdate
from app.services import user_service


@pytest.mark.parametrize(
    "anthropometry",
    [
        {"weight_kg": -1},
        {"height_cm": 500},
        {"age": 2},
        {"measurements": {"waist_cm": -10}},
    ],
)
def test_invalid_anthropometry_is_rejected(anthropometry: dict) -> None:
    with pytest.raises(ValidationError):
        UserProfileUpdate(anthropometry=anthropometry)


def test_known_profile_values_are_accepted() -> None:
    body = UserProfileUpdate(
        anthropometry={"weight_kg": 82.5, "height_cm": 181, "age": 35},
        goals={
            "primary_goal": "maintain",
            "level": "intermediate",
            "location": "gym",
            "activity_level": "moderate",
            "days_per_week": 3,
            "target_weight_kg": 75,
        },
    )
    assert body.anthropometry == {"weight_kg": 82.5, "height_cm": 181, "age": 35}


@pytest.mark.parametrize("target", [0, 19.9, 500.1, "soon", True])
def test_invalid_target_weight_is_rejected(target: object) -> None:
    with pytest.raises(ValidationError):
        UserProfileUpdate(goals={"target_weight_kg": target})


@pytest.mark.asyncio
async def test_program_change_resets_server_schedule_cursor(monkeypatch) -> None:
    class FakeSession:
        async def commit(self) -> None:
            return None

        async def refresh(self, _user: User) -> None:
            return None

    user = User(
        id=uuid.uuid4(),
        anthropometry={},
        goals={
            "active_program_id": "old-program",
            "active_program_started_at": "2026-08-01",
            "active_program_next_day": 4,
        },
    )
    monkeypatch.setattr(user_service, "local_schedule_day", lambda _goals: date(2026, 8, 27))

    await user_service.update_profile(
        FakeSession(),  # type: ignore[arg-type]
        user,
        UserProfileUpdate(goals={"active_program_id": "new-program"}),
    )

    assert user.goals["active_program_started_at"] == "2026-08-27"
    assert user.goals["active_program_next_day"] == 1
    assert user.goals["active_program_week_phase"] == "light"


def test_cycle_training_preference_must_be_boolean() -> None:
    assert UserProfileUpdate(goals={"cycle_training_enabled": True}).goals == {
        "cycle_training_enabled": True
    }
    with pytest.raises(ValidationError):
        UserProfileUpdate(goals={"cycle_training_enabled": "true"})
