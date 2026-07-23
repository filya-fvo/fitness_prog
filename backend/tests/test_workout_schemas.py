"""Unit tests for workout-related pydantic schemas."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.schemas.workout import WorkoutCompleteRequest, WorkoutCreate, WorkoutSetCreate


def test_workout_create_defaults() -> None:
    body = WorkoutCreate(scheduled_date=date(2026, 7, 22))
    assert body.program_id is None
    assert body.exercise_ids == []
    assert body.sets_per_exercise == 3
    assert body.plan is None


def test_workout_set_create_validation() -> None:
    body = WorkoutSetCreate(
        exercise_id=uuid4(),
        set_number=1,
        reps=10,
        weight=Decimal("40.5"),
        rest_time_sec=60,
        is_completed=True,
    )
    assert body.reps == 10
    assert body.is_completed is True


def test_complete_request_rpe_bounds() -> None:
    body = WorkoutCompleteRequest(rpe=8, ai_notes="Хорошая сессия")
    assert body.rpe == 8
