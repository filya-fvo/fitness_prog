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
        },
    )
    assert body.anthropometry == {"weight_kg": 82.5, "height_cm": 181, "age": 35}
