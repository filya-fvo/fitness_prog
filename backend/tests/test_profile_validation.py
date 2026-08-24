"""Server-side profile validation cannot be bypassed by a custom API client."""

import pytest
from pydantic import ValidationError

from app.schemas.user import UserProfileUpdate


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
