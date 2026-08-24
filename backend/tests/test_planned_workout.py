"""Prepared exercise replacements are validated and applied to one program day."""

from __future__ import annotations

from uuid import uuid4
from datetime import date

import pytest
from fastapi import HTTPException

from app.models.exercise import Exercise
from app.models.workout_plan_override import WorkoutPlanOverride
from app.services.planned_workout import apply_replacements, apply_saved_override


class ScalarRows:
    def __init__(self, rows: list[Exercise]) -> None:
        self.rows = rows

    def all(self) -> list[Exercise]:
        return self.rows


class ExerciseSession:
    def __init__(self, rows: list[Exercise]) -> None:
        self.rows = rows

    async def scalars(self, _query) -> ScalarRows:
        return ScalarRows(self.rows)


class OverrideSession(ExerciseSession):
    def __init__(self, override: WorkoutPlanOverride, rows: list[Exercise]) -> None:
        super().__init__(rows)
        self.override = override
        self.deleted: list[WorkoutPlanOverride] = []

    async def scalar(self, _query) -> WorkoutPlanOverride:
        return self.override

    async def delete(self, item: WorkoutPlanOverride) -> None:
        self.deleted.append(item)


def exercise(exercise_id, name: str) -> Exercise:
    return Exercise(
        id=exercise_id,
        name_ru=name,
        muscle_group="Спина",
        equipment="Тренажёр",
        difficulty=2,
        tags=[],
    )


@pytest.mark.asyncio
async def test_prepared_replacement_keeps_targets_and_original_exercise() -> None:
    source_id, target_id = uuid4(), uuid4()
    base = {
        "title": "Тяга · Средняя",
        "exercises": [
            {
                "exercise_id": str(source_id),
                "order": 1,
                "target_sets": 4,
                "target_reps": "8-12",
                "rest_sec": 90,
                "name_ru": "Тяга верхнего блока",
                "suggested_weight": 50,
            }
        ],
    }

    plan = await apply_replacements(
        ExerciseSession([exercise(target_id, "Подтягивания в тренажёре")]),  # type: ignore[arg-type]
        base,
        [{"from_exercise_id": str(source_id), "to_exercise_id": str(target_id)}],
    )

    item = plan["exercises"][0]
    assert item["exercise_id"] == str(target_id)
    assert item["original_exercise_id"] == str(source_id)
    assert item["name_ru"] == "Подтягивания в тренажёре"
    assert item["target_sets"] == 4
    assert item["target_reps"] == "8-12"
    assert "suggested_weight" not in item


@pytest.mark.asyncio
async def test_prepared_replacement_rejects_duplicate_final_exercise() -> None:
    first_id, second_id = uuid4(), uuid4()
    base = {
        "exercises": [
            {"exercise_id": str(first_id), "order": 1},
            {"exercise_id": str(second_id), "order": 2},
        ]
    }

    with pytest.raises(HTTPException, match="дважды"):
        await apply_replacements(
            ExerciseSession([]),  # type: ignore[arg-type]
            base,
            [{"from_exercise_id": str(first_id), "to_exercise_id": str(second_id)}],
        )


@pytest.mark.asyncio
async def test_saved_override_is_consumed_only_when_workout_starts() -> None:
    user_id, program_id, source_id, target_id = uuid4(), uuid4(), uuid4(), uuid4()
    override = WorkoutPlanOverride(
        user_id=user_id,
        program_id=program_id,
        scheduled_date=date(2026, 8, 25),
        day_index=1,
        week_phase="medium",
        replacements=[
            {"from_exercise_id": str(source_id), "to_exercise_id": str(target_id)}
        ],
    )
    session = OverrideSession(override, [exercise(target_id, "Подтягивания")])

    plan = await apply_saved_override(
        session,  # type: ignore[arg-type]
        user_id=user_id,
        program_id=program_id,
        scheduled_date=date(2026, 8, 25),
        day_index=1,
        base_plan={"exercises": [{"exercise_id": str(source_id), "order": 1}]},
        consume=True,
    )

    assert plan["exercises"][0]["exercise_id"] == str(target_id)
    assert session.deleted == [override]
