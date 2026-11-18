"""Recorded parts retain their exercise identity during plan reconciliation."""
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.workout_plan_sets import align_replacement_slots


@pytest.mark.asyncio
async def test_replacement_never_moves_a_partially_recorded_compound_set():
    original, replacement = uuid4(), uuid4()
    recorded = SimpleNamespace(exercise_id=original, set_number=1, is_completed=False,
        execution_kind="drop", is_deleted=False, parts=[SimpleNamespace(status="completed", is_deleted=False)])
    untouched = SimpleNamespace(exercise_id=original, set_number=2, is_completed=False,
        execution_kind="standard", is_deleted=False, parts=[])
    workout = SimpleNamespace(plan={"exercises": [{"exercise_id": str(original)}]}, sets=[recorded, untouched])
    plan = {"exercises": [{"exercise_id": str(replacement), "original_exercise_id": str(original)}]}

    await align_replacement_slots(None, workout, plan)

    assert recorded.exercise_id == original
    assert untouched.exercise_id == replacement
