from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.models.user import User
from app.services import cycle_training, workout_service


@pytest.mark.parametrize(
    ("base", "readiness", "expected"),
    [
        ("heavy", "normal", None),
        ("heavy", "caution", "medium"),
        ("medium", "caution", None),
        ("heavy", "reduce", "light"),
        ("medium", "reduce", "light"),
        ("heavy", "rest", "light"),
        ("light", "rest", "light"),
    ],
)
def test_cycle_readiness_caps_planned_phase(
    base: str,
    readiness: str,
    expected: str | None,
) -> None:
    result = cycle_training.adapt_week_phase(base, readiness)
    assert (result or {}).get("week_phase") == expected


def test_cycle_adjustment_rejects_unknown_values() -> None:
    assert cycle_training.normalize_cycle_readiness("unknown") is None
    assert cycle_training.adapt_week_phase("heavy", "unknown") is None
    assert cycle_training.cycle_training_enabled({"cycle_training_enabled": True})
    assert not cycle_training.cycle_training_enabled({"cycle_training_enabled": "true"})


@pytest.mark.asyncio
async def test_user_plan_uses_daily_cycle_readiness_without_moving_program_cursor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    program_id = uuid.uuid4()
    user = User(
        id=uuid.uuid4(),
        anthropometry={"sex": "female"},
        goals={
            "active_program_id": str(program_id),
            "active_program_started_at": "2026-09-01",
            "active_program_week_phase": "heavy",
            "cycle_training_enabled": True,
        },
    )
    metric = SimpleNamespace(cycle_readiness="reduce")

    async def fake_metric(*_args, **_kwargs):
        return metric

    async def fake_plan(*_args, week_phase=None, **_kwargs):
        return {
            "title": "Ноги · Лёгкая",
            "week_phase": week_phase,
            "week_label": "Лёгкая",
            "week_rir": "3–4 до отказа",
            "exercises": [],
        }

    monkeypatch.setattr(workout_service.daily_metrics, "get_for_day", fake_metric)
    monkeypatch.setattr(workout_service, "build_plan_from_program_day", fake_plan)

    plan = await workout_service.build_program_plan_for_user(
        SimpleNamespace(),  # type: ignore[arg-type]
        user,
        SimpleNamespace(id=program_id),  # type: ignore[arg-type]
        day_index=1,
        scheduled_date=date(2026, 9, 5),
        week_phase="heavy",
        include_saved_override=False,
    )

    assert plan["base_week_phase"] == "heavy"
    assert plan["week_phase"] == "light"
    assert plan["load_adjustment"] == "cycle_reduce"
    assert user.goals["active_program_week_phase"] == "heavy"


@pytest.mark.asyncio
async def test_admin_style_preview_can_ignore_private_readiness(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = User(
        id=uuid.uuid4(),
        anthropometry={},
        goals={"cycle_training_enabled": True},
    )
    metric_was_read = False

    async def fake_metric(*_args, **_kwargs):
        nonlocal metric_was_read
        metric_was_read = True
        return SimpleNamespace(cycle_readiness="reduce")

    async def fake_plan(*_args, week_phase=None, **_kwargs):
        return {"week_phase": week_phase or "heavy", "exercises": []}

    monkeypatch.setattr(workout_service.daily_metrics, "get_for_day", fake_metric)
    monkeypatch.setattr(workout_service, "build_plan_from_program_day", fake_plan)

    plan = await workout_service.build_program_plan_for_user(
        SimpleNamespace(),  # type: ignore[arg-type]
        user,
        SimpleNamespace(id=uuid.uuid4()),  # type: ignore[arg-type]
        day_index=1,
        scheduled_date=date(2026, 9, 5),
        week_phase="heavy",
        include_saved_override=False,
        apply_readiness_adjustment=False,
    )

    assert plan["week_phase"] == "heavy"
    assert "load_adjustment" not in plan
    assert not metric_was_read
