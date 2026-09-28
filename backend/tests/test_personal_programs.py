"""Personal programs remain private and retain their chosen progression."""

from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.models.program import Program
from app.schemas.program import PersonalProgramCreate
from app.services import program_publication, program_service, scheduler, workout_service


class ExerciseResult:
    def __init__(self, exercise):
        self.exercise = exercise

    def all(self):
        return [self.exercise]


class Session:
    def __init__(self, exercise):
        self.exercise = exercise
        self.added = None
        self.commits = 0

    async def scalars(self, _statement):
        return ExerciseResult(self.exercise)

    def add(self, program):
        self.added = program

    async def commit(self):
        self.commits += 1

    async def refresh(self, _program):
        pass


def payload(exercise_id: uuid.UUID, *, progression: str = "linear") -> PersonalProgramCreate:
    return PersonalProgramCreate.model_validate({
        "name": "Мой план",
        "location": "home",
        "progression": progression,
        "days": [{"name": "Верх тела", "exercises": [
            {"exercise_id": str(exercise_id), "sets": 4, "reps": "6-8", "rest_sec": 90}
        ]}],
    })


@pytest.mark.asyncio
async def test_personal_program_is_private_and_linear_reps_are_preserved() -> None:
    owner_id = uuid.uuid4()
    exercise = SimpleNamespace(id=uuid.uuid4(), name_ru="Жим гантелей лёжа")
    session = Session(exercise)
    program = await program_service.create_personal_program(
        session, user_id=owner_id, data=payload(exercise.id)
    )  # type: ignore[arg-type]

    assert session.commits == 1
    assert program.owner_id == owner_id
    assert program.is_template is False
    assert program_publication.is_accessible_to_user(program, None, user_id=owner_id)
    assert not program_publication.is_accessible_to_user(
        program, program.id, user_id=uuid.uuid4()
    )
    assert not program_publication.is_public_catalog_program(program)

    plan = await workout_service.build_plan_from_program_day(
        session, program, 1, today=date(2026, 9, 28)
    )  # type: ignore[arg-type]
    assert plan["exercises"][0]["target_sets"] == 4
    assert plan["exercises"][0]["target_reps"] == "6-8"
    assert plan["week_label"] == "Линейный план"


@pytest.mark.asyncio
async def test_phased_personal_program_uses_week_targets() -> None:
    exercise = SimpleNamespace(id=uuid.uuid4(), name_ru="Жим гантелей лёжа")
    session = Session(exercise)
    program = await program_service.create_personal_program(
        session, user_id=uuid.uuid4(), data=payload(exercise.id, progression="phased")
    )  # type: ignore[arg-type]
    plan = await workout_service.build_plan_from_program_day(
        session, program, 1, today=date(2026, 9, 28)
    )  # type: ignore[arg-type]
    assert plan["exercises"][0]["target_reps"] == "12-15"


def test_personal_program_has_bounded_days_and_sets() -> None:
    valid = payload(uuid.uuid4()).model_dump(mode="json")
    valid["days"][0]["exercises"][0]["sets"] = 20
    with pytest.raises(ValidationError):
        PersonalProgramCreate.model_validate(valid)


@pytest.mark.parametrize("field,value", [
    ("name", "   "),
    ("day_name", "   "),
    ("reps", "   "),
])
def test_personal_program_rejects_blank_fields(field: str, value: str) -> None:
    invalid = payload(uuid.uuid4()).model_dump(mode="json")
    if field == "name":
        invalid["name"] = value
    elif field == "day_name":
        invalid["days"][0]["name"] = value
    else:
        invalid["days"][0]["exercises"][0]["reps"] = value
    with pytest.raises(ValidationError):
        PersonalProgramCreate.model_validate(invalid)


def test_public_programs_still_have_no_owner() -> None:
    program = Program(
        id=uuid.uuid4(), name="Общая", structure={}, publication_status="published",
        is_current=True, is_deleted=False, owner_id=None,
    )
    assert program_publication.is_public_catalog_program(program)


@pytest.mark.asyncio
async def test_schedule_cannot_show_someone_elses_personal_program() -> None:
    owner_id = uuid.uuid4()
    viewer_id = uuid.uuid4()
    program = Program(
        id=uuid.uuid4(), name="Чужой личный план", structure={"schedule": [
            {"day_index": 1, "name": "Секретный день"}
        ]}, publication_status="published", is_current=True, is_deleted=False,
        owner_id=owner_id,
    )

    class ScheduleSession:
        async def scalar(self, _statement):
            return program

    user = SimpleNamespace(id=viewer_id, goals={"active_program_id": str(program.id)})
    result = await scheduler.active_program_snapshot(
        ScheduleSession(), user  # type: ignore[arg-type]
    )
    assert result[0] is None
    assert "Чужой" not in result[2]
