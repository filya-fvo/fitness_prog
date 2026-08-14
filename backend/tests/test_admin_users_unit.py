"""Unit tests for admin user helpers (no DB)."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.main import app
from app.models.user import User
from app.routers.admin import admin_clear_user_data, admin_reset_user
from app.schemas.admin import AdminClearRequest
from app.services.admin_users import _clear_measurements, display_name, to_admin_row


def test_display_name_prefers_last_first() -> None:
    u = SimpleNamespace(
        id=uuid4(),
        username="ivanov",
        auth_email=None,
        telegram_id=1,
        anthropometry={"first_name": "Иван", "last_name": "Иванов"},
        goals={},
        subscription_status="free",
        created_at=None,
        updated_at=None,
    )
    assert display_name(u) == "Иванов Иван"


def test_display_name_fallback_username() -> None:
    u = SimpleNamespace(
        id=uuid4(),
        username="petrov",
        auth_email=None,
        telegram_id=2,
        anthropometry={},
        goals={},
        subscription_status="free",
        created_at=None,
        updated_at=None,
    )
    assert display_name(u) == "@petrov"


def test_to_admin_row_onboarding_flag() -> None:
    u = SimpleNamespace(
        id=uuid4(),
        username="x",
        auth_email="a@b.c",
        telegram_id=3,
        anthropometry={"first_name": "A"},
        goals={"onboarding_completed": True, "primary_goal": "maintain", "level": "beginner"},
        subscription_status="free",
        created_at=None,
        updated_at=None,
    )
    row = to_admin_row(u, workouts_count=2, completed_workouts=1)
    assert row.onboarding_completed is True
    assert row.workouts_count == 2
    assert row.primary_goal == "maintain"


def test_clear_measurements_preserves_base_profile() -> None:
    user = User(
        anthropometry={
            "first_name": "Иван",
            "height_cm": 180,
            "weight_kg": 82,
            "measurements": {"waist": 88, "chest": 105},
            "measurements_updated_at": "2026-08-10T10:00:00Z",
        },
        goals={
            "onboarding_completed": True,
            "active_program_id": "program-1",
            "notification_state": {
                "last_measurement_date": "2026-08-10",
                "last_measurement_mark": "meas:2026-08-10",
                "last_workout_mark": "workout:2026-08-10",
            },
        },
    )

    stats = _clear_measurements(user)

    assert stats == {"measurements": 2}
    assert user.anthropometry == {
        "first_name": "Иван",
        "height_cm": 180,
        "weight_kg": 82,
    }
    assert user.goals["onboarding_completed"] is True
    assert user.goals["active_program_id"] == "program-1"
    assert user.goals["notification_state"] == {
        "last_workout_mark": "workout:2026-08-10"
    }


def test_partial_clear_requires_separate_endpoint_and_explicit_scope() -> None:
    with pytest.raises(ValidationError):
        AdminClearRequest()  # type: ignore[call-arg]

    schema = app.openapi()
    reset_operation = schema["paths"]["/admin/users/{user_id}/reset"]["post"]
    reset_query_names = {
        item["name"] for item in reset_operation["parameters"] if item["in"] == "query"
    }
    assert "scope" not in reset_query_names

    clear_operation = schema["paths"]["/admin/users/{user_id}/clear"]["post"]
    assert clear_operation["requestBody"]["required"] is True
    clear_schema = schema["components"]["schemas"]["AdminClearRequest"]
    assert "scope" in clear_schema["required"]
    assert "confirm_full_reset" not in clear_schema["required"]
    assert clear_schema["properties"]["scope"]["enum"] == [
        "all",
        "workouts",
        "nutrition",
        "measurements",
    ]


@pytest.mark.asyncio
async def test_legacy_reset_is_retired() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await admin_reset_user(uuid4(), SimpleNamespace())  # type: ignore[arg-type]
    assert exc_info.value.status_code == 410


@pytest.mark.asyncio
async def test_full_clear_requires_second_confirmation() -> None:
    body = AdminClearRequest(scope="all", confirm_full_reset=False)
    with pytest.raises(HTTPException) as exc_info:
        await admin_clear_user_data(
            uuid4(),
            body,
            SimpleNamespace(),  # type: ignore[arg-type]
            SimpleNamespace(),  # type: ignore[arg-type]
            SimpleNamespace(),  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 400
