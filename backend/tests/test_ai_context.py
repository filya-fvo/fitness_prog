"""AI context must use the real program and recorded workout sets."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from app.ai.context import _format_workout, _profile_context, _program_context
from app.models.program import Program
from app.models.workout import Workout, WorkoutSet


def test_program_context_uses_active_program_cursor_day() -> None:
    program = Program(
        name="PPL 6",
        workout_type="push_pull_legs",
        structure={
            "schedule": [
                {"day_index": 1, "name": "Push A", "exercises": []},
                {
                    "day_index": 2,
                    "name": "Legs A",
                    "exercises": [
                        {"exercise_name": "Приседания со штангой", "sets": 4, "reps": "6-8"}
                    ],
                },
            ]
        },
    )

    context = "\n".join(
        _program_context(
            program,
            {
                "active_program_next_day": 2,
                "active_program_week_phase": "heavy",
            },
        )
    )

    assert "PPL 6" in context
    assert "Legs A" in context
    assert "Приседания со штангой (4×6-8)" in context
    assert "Приседания со своим весом" not in context


def test_profile_context_contains_current_and_target_weight() -> None:
    context = _profile_context(
        {"primary_goal": "lose_fat", "target_weight_kg": 75},
        {"weight_kg": 82.5},
    )
    assert "вес=82.5 кг" in context
    assert "желаемый вес=75 кг" in context


def test_workout_context_contains_actual_completed_sets() -> None:
    exercise_id = uuid.uuid4()
    workout = Workout(
        user_id=uuid.uuid4(),
        scheduled_date=date(2026, 8, 11),
        status="completed",
        title="Legs A",
        workout_type="legs",
        rpe=8,
        duration_sec=3600,
        plan={
            "exercises": [
                {
                    "exercise_id": str(exercise_id),
                    "name_ru": "Приседания со штангой",
                    "target_sets": 2,
                    "target_reps": "6-8",
                }
            ]
        },
    )
    workout.sets = [
        WorkoutSet(
            workout_id=uuid.uuid4(),
            exercise_id=exercise_id,
            set_number=1,
            reps=8,
            weight=Decimal("80.00"),
            is_completed=True,
        ),
        WorkoutSet(
            workout_id=uuid.uuid4(),
            exercise_id=exercise_id,
            set_number=2,
            reps=7,
            weight=Decimal("85.00"),
            is_completed=True,
        ),
    ]

    context = "\n".join(_format_workout(workout, {}))

    assert "Legs A" in context
    assert "RPE 8/10" in context
    assert "80 кг × 8" in context
    assert "85 кг × 7" in context


def test_workout_context_marks_replacement_and_hides_stale_empty_original() -> None:
    original_id = uuid.uuid4()
    replacement_id = uuid.uuid4()
    workout = Workout(
        user_id=uuid.uuid4(),
        scheduled_date=date(2026, 8, 11),
        status="completed",
        title="Legs A",
        plan={
            "exercises": [
                {
                    "exercise_id": str(replacement_id),
                    "original_exercise_id": str(original_id),
                    "name_ru": "Болгарские выпады",
                    "target_sets": 3,
                    "target_reps": "10-15",
                }
            ]
        },
    )
    workout.sets = [
        WorkoutSet(
            workout_id=uuid.uuid4(),
            exercise_id=original_id,
            set_number=1,
            is_completed=False,
        ),
        WorkoutSet(
            workout_id=uuid.uuid4(),
            exercise_id=replacement_id,
            set_number=1,
            reps=15,
            weight=Decimal("10.00"),
            is_completed=True,
        ),
    ]

    context = "\n".join(
        _format_workout(
            workout,
            {
                original_id: "Выпады назад с гантелями",
                replacement_id: "Болгарские выпады",
            },
        )
    )

    assert "Болгарские выпады (замена вместо Выпады назад с гантелями)" in context
    assert "Выпады назад с гантелями: план" not in context
