from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout
from app.schemas.program import ProgramStartRequest
from app.schemas.workout import WorkoutCreate
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
    assert cycle_training.cycle_training_enabled(
        {"cycle_training_enabled": True}, {"sex": "female"}
    )
    assert not cycle_training.cycle_training_enabled(
        {"cycle_training_enabled": True}, {"sex": "male"}
    )
    assert not cycle_training.cycle_training_enabled(
        {"cycle_training_enabled": True}, {"sex": "other"}
    )
    assert not cycle_training.cycle_training_enabled({"cycle_training_enabled": "true"})
    with pytest.raises(ValueError):
        ProgramStartRequest(cycle_readiness="unknown")
    assert WorkoutCreate(
        scheduled_date=date(2026, 9, 5),
        cycle_readiness="reduce",
    ).cycle_readiness == "reduce"
    with pytest.raises(ValueError):
        WorkoutCreate(scheduled_date=date(2026, 9, 5), cycle_readiness="unknown")


@pytest.mark.asyncio
async def test_user_plan_uses_explicit_preworkout_readiness_without_moving_program_cursor(
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

    async def fake_plan(*_args, week_phase=None, **_kwargs):
        return {
            "title": "Ноги · Лёгкая",
            "week_phase": week_phase,
            "week_label": "Лёгкая",
            "week_rir": "3–4 до отказа",
            "exercises": [],
        }

    monkeypatch.setattr(workout_service, "build_plan_from_program_day", fake_plan)

    plan = await workout_service.build_program_plan_for_user(
        SimpleNamespace(),  # type: ignore[arg-type]
        user,
        SimpleNamespace(id=program_id),  # type: ignore[arg-type]
        day_index=1,
        scheduled_date=date(2026, 9, 5),
        week_phase="heavy",
        include_saved_override=False,
        cycle_readiness="reduce",
    )

    assert plan["base_week_phase"] == "heavy"
    assert plan["week_phase"] == "light"
    assert plan["load_adjustment"] == "cycle_reduce"
    assert user.goals["active_program_week_phase"] == "heavy"


@pytest.mark.asyncio
async def test_plan_without_explicit_answer_does_not_apply_private_readiness(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = User(
        id=uuid.uuid4(),
        anthropometry={},
        goals={"cycle_training_enabled": True},
    )

    async def fake_plan(*_args, week_phase=None, **_kwargs):
        return {"week_phase": week_phase or "heavy", "exercises": []}

    monkeypatch.setattr(workout_service, "build_plan_from_program_day", fake_plan)

    plan = await workout_service.build_program_plan_for_user(
        SimpleNamespace(),  # type: ignore[arg-type]
        user,
        SimpleNamespace(id=uuid.uuid4()),  # type: ignore[arg-type]
        day_index=1,
        scheduled_date=date(2026, 9, 5),
        week_phase="heavy",
        include_saved_override=False,
    )

    assert plan["week_phase"] == "heavy"
    assert plan["base_week_phase"] == "heavy"
    assert "load_adjustment" not in plan


@pytest.mark.asyncio
async def test_male_profile_ignores_explicit_legacy_cycle_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = User(
        id=uuid.uuid4(),
        anthropometry={"sex": "male"},
        goals={"cycle_training_enabled": True},
    )

    async def fake_plan(*_args, week_phase=None, **_kwargs):
        return {"week_phase": week_phase or "heavy", "exercises": []}

    monkeypatch.setattr(workout_service, "build_plan_from_program_day", fake_plan)
    plan = await workout_service.build_program_plan_for_user(
        SimpleNamespace(),  # type: ignore[arg-type]
        user,
        SimpleNamespace(id=uuid.uuid4()),  # type: ignore[arg-type]
        day_index=1,
        scheduled_date=date(2026, 9, 5),
        week_phase="heavy",
        include_saved_override=False,
        cycle_readiness="reduce",
    )

    assert plan["week_phase"] == "heavy"
    assert plan["base_week_phase"] == "heavy"
    assert "load_adjustment" not in plan


@pytest.mark.asyncio
async def test_reduced_heavy_phase_is_repeated_before_cycle_advances() -> None:
    user_id, program_id = uuid.uuid4(), uuid.uuid4()
    user = User(
        id=user_id,
        goals={
            "active_program_id": str(program_id),
            "active_program_next_day": 1,
            "active_program_week_phase": "heavy",
            "active_program_workouts_in_phase": 0,
        },
    )
    program = Program(
        id=program_id,
        name="A/B/C",
        workout_type="strength",
        structure={
            "schedule": [
                {"day_index": index, "name": name, "exercises": []}
                for index, name in enumerate(("A", "B", "C"), start=1)
            ]
        },
    )
    workouts = [
        Workout(
            id=uuid.uuid4(),
            user_id=user_id,
            program_id=program_id,
            scheduled_date=date(2026, 9, 7 + index),
            status="completed",
            plan={
                "day_index": index,
                "base_week_phase": "heavy",
                "week_phase": "light" if index == 1 else "heavy",
            },
        )
        for index in range(1, 4)
    ]
    session = AsyncMock()
    session.scalar = AsyncMock(
        side_effect=[value for workout in workouts for value in (program, workout.id)]
    )

    for workout in workouts:
        assert await workout_service._advance_program_cursor_for_completed_workout(
            session,
            user,
            workout,
        )

    assert user.goals["active_program_next_day"] == 1
    assert user.goals["active_program_week_phase"] == "heavy"
    assert user.goals["active_program_workouts_in_phase"] == 0
    assert "active_program_repeat_phase" not in user.goals
