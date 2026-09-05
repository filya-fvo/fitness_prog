"""Unit tests for workout-related pydantic schemas."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.workout import (
    WorkoutCompleteRequest,
    WorkoutCreate,
    WorkoutPlan,
    WorkoutSetCreate,
    WorkoutUpdateRequest,
)
from app.services import workout_service


def test_workout_create_defaults() -> None:
    body = WorkoutCreate(scheduled_date=date(2026, 7, 22))
    assert body.program_id is None
    assert body.exercise_ids == []
    assert body.sets_per_exercise == 3
    assert body.plan is None
    assert body.client_workout_id is None


def test_workout_create_accepts_client_idempotency_key() -> None:
    client_id = uuid4()
    body = WorkoutCreate(scheduled_date=date(2026, 8, 13), client_workout_id=client_id)
    assert body.client_workout_id == client_id


def test_workout_plan_keeps_replacement_context() -> None:
    original_id = uuid4()
    plan = WorkoutPlan(
        location="home",
        equipment=["bodyweight", "dumbbells"],
        limitations=["no_knee"],
        exercises=[
            {
                "exercise_id": uuid4(),
                "original_exercise_id": original_id,
                "order": 1,
                "suggested_weight": Decimal("12.5"),
                "weight_mode": "per_hand",
                "note": "Не терять темп",
            }
        ],
    )
    assert plan.location == "home"
    assert plan.equipment == ["bodyweight", "dumbbells"]
    assert plan.limitations == ["no_knee"]
    assert plan.exercises[0].original_exercise_id == original_id
    assert plan.exercises[0].suggested_weight == Decimal("12.5")
    assert plan.exercises[0].weight_mode == "per_hand"
    assert plan.exercises[0].note == "Не терять темп"


def test_program_plan_defaults_are_copied_to_created_set_slots() -> None:
    class Session:
        def __init__(self) -> None:
            self.added = []

        def add(self, value) -> None:
            self.added.append(value)

    session = Session()
    workout_service._create_set_slots(  # type: ignore[arg-type]
        session,
        uuid4(),
        {
            "exercises": [{
                "exercise_id": str(uuid4()),
                "target_sets": 2,
                "rest_sec": 75,
                "weight_mode": "per_hand",
                "note": "Контролировать технику",
            }],
        },
    )

    assert len(session.added) == 2
    assert all(item.weight_mode == "per_hand" for item in session.added)
    assert all(item.note == "Контролировать технику" for item in session.added)


def test_workout_set_create_validation() -> None:
    body = WorkoutSetCreate(
        exercise_id=uuid4(),
        set_number=1,
        reps=10,
        weight=Decimal("40.5"),
        weight_mode="per_hand",
        rest_time_sec=60,
        duration_sec=90,
        note="Темп 3-1-1",
        machine_params={"speed_kmh": 8.5, "incline_pct": 2},
        is_completed=True,
    )
    assert body.reps == 10
    assert body.duration_sec == 90
    assert body.weight_mode == "per_hand"
    assert body.note == "Темп 3-1-1"
    assert body.machine_params == {"speed_kmh": 8.5, "incline_pct": 2}
    assert body.is_completed is True


def test_complete_request_rpe_bounds() -> None:
    body = WorkoutCompleteRequest(rpe=8, ai_notes="Хорошая сессия")
    assert body.rpe == 8


def test_completed_workout_summary_can_be_edited() -> None:
    body = WorkoutUpdateRequest(rpe=6, ai_notes="Исправленная заметка")
    assert body.rpe == 6
    assert body.ai_notes == "Исправленная заметка"


@pytest.mark.parametrize(
    ("field", "value"),
    [("weight", Decimal("10000.01")), ("reps", 100_001), ("rest_time_sec", 3601)],
)
def test_workout_set_rejects_values_outside_database_bounds(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        WorkoutSetCreate(exercise_id=uuid4(), set_number=1, **{field: value})
