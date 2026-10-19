"""Reordering a plan never deletes or reassigns recorded set identities."""
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.workout import Workout, WorkoutSet
from app.schemas.workout import WorkoutPlan
from app.services import workout_service
from tests.test_workout_customization import database as database


@pytest.mark.asyncio
async def test_reordering_exercises_preserves_saved_set_identity(database):
    session, owner, _, _, first, second, _ = database
    workout = Workout(id=uuid4(), user_id=owner.id, scheduled_date=date(2026, 10, 19), status="planned", plan={"exercises": [
        {"exercise_id": str(first.id), "order": 1}, {"exercise_id": str(second.id), "order": 2}]})
    session.add(workout)
    await session.flush()
    session.add_all([WorkoutSet(workout_id=workout.id, exercise_id=first.id, set_number=1, weight=20),
                     WorkoutSet(workout_id=workout.id, exercise_id=second.id, set_number=1, weight=30)])
    await session.commit()
    await workout_service.update_workout_plan(session, owner, workout.id, WorkoutPlan(exercises=[
        {"exercise_id": second.id, "order": 1}, {"exercise_id": first.id, "order": 2}]))
    stored = (await session.scalars(select(WorkoutSet).where(WorkoutSet.workout_id == workout.id))).all()
    assert {(row.exercise_id, row.weight) for row in stored} == {(first.id, 20), (second.id, 30)}
