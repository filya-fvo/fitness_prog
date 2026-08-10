"""Unit tests for admin user helpers (no DB)."""

from types import SimpleNamespace
from uuid import uuid4

from app.services.admin_users import display_name, to_admin_row


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
