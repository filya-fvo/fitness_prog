from __future__ import annotations

from app.models.user import User
from app.services.account_merge import merge_values, profile_conflicts


def test_merge_values_preserves_unique_nested_data_and_preferred_conflicts() -> None:
    email = {
        "weight_kg": 80,
        "measurements": {"waist": 82},
        "tags": ["email-only", "shared"],
    }
    telegram = {
        "weight_kg": 75,
        "measurements": {"chest": 100},
        "tags": ["telegram-only", "shared"],
    }

    merged = merge_values(email, telegram)

    assert merged["weight_kg"] == 80
    assert merged["measurements"] == {"waist": 82, "chest": 100}
    assert merged["tags"] == ["email-only", "shared", "telegram-only"]


def test_profile_conflicts_are_reported_without_exposing_values() -> None:
    email_user = User(anthropometry={"weight_kg": 80}, goals={"primary_goal": "maintain"})
    telegram_user = User(anthropometry={"weight_kg": 75}, goals={"primary_goal": "gain_muscle"})

    assert profile_conflicts(email_user, telegram_user) == [
        "Данные тела и замеры",
        "Цели, программа и настройки",
    ]
