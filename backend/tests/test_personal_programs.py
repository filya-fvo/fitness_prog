"""Personal programs remain private and retain their chosen progression."""

from __future__ import annotations

import uuid
import json
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.program import Program
from app.schemas.program import PersonalProgramCreate
from app.services import program_publication, program_service, scheduler, workout_service


class ExerciseResult:
    def __init__(self, exercise):
        self.exercise = exercise

    def all(self):
        return self.exercise if isinstance(self.exercise, list) else [self.exercise]


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


@pytest.mark.parametrize("rest_sec", [0, 300])
def test_personal_program_accepts_rest_boundaries(rest_sec: int) -> None:
    data = payload(uuid.uuid4()).model_dump(mode="json")
    data["days"][0]["exercises"][0]["rest_sec"] = rest_sec
    validated = PersonalProgramCreate.model_validate(data)
    assert validated.days[0].exercises[0].rest_sec == rest_sec


@pytest.mark.parametrize("rest_sec", [-1, 301])
def test_personal_program_rejects_out_of_range_rest(rest_sec: int) -> None:
    data = payload(uuid.uuid4()).model_dump(mode="json")
    data["days"][0]["exercises"][0]["rest_sec"] = rest_sec
    with pytest.raises(ValidationError):
        PersonalProgramCreate.model_validate(data)


def test_personal_program_omitted_rest_defaults_to_sixty() -> None:
    data = payload(uuid.uuid4()).model_dump(mode="json")
    del data["days"][0]["exercises"][0]["rest_sec"]
    validated = PersonalProgramCreate.model_validate(data)
    assert validated.days[0].exercises[0].rest_sec == 60


@pytest.mark.asyncio
@pytest.mark.parametrize("progression", ["linear", "phased"])
@pytest.mark.parametrize("week_phase", ["light", "medium", "heavy"])
async def test_personal_program_create_to_plan_preserves_zero_rest(
    progression: str, week_phase: str,
) -> None:
    exercise = SimpleNamespace(id=uuid.uuid4(), name_ru="Жим гантелей лёжа")
    data = payload(exercise.id, progression=progression).model_dump(mode="json")
    data["days"][0]["exercises"][0]["rest_sec"] = 0
    session = Session(exercise)
    program = await program_service.create_personal_program(
        session, user_id=uuid.uuid4(), data=PersonalProgramCreate.model_validate(data)
    )  # type: ignore[arg-type]
    assert program.structure["schedule"][0]["exercises"][0]["rest_sec"] == 0
    plan = await workout_service.build_plan_from_program_day(
        session, program, 1, today=date(2026, 9, 28), week_phase=week_phase,
    )  # type: ignore[arg-type]
    assert plan["exercises"][0]["rest_sec"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("progression", ["linear", "phased"])
@pytest.mark.parametrize("week_phase,phase_index", [("light", 0), ("medium", 1), ("heavy", 2)])
@pytest.mark.parametrize("exercise_rest,day_rest,expected", [
    ({"rest_sec": 0}, {"rest_sec_default": 120}, (0, 0, 0)),
    ({}, {"rest_sec_default": 0}, (0, 0, 0)),
    ({"rest_sec": None}, {"rest_sec_default": 0}, (0, 0, 0)),
    ({}, {}, (60, 60, 90)),
    ({"rest_sec": None}, {"rest_sec_default": None}, (60, 60, 90)),
    ({}, {"rest_sec_default": 120}, (75, 120, 120)),
    ({"rest_sec": 30}, {"rest_sec_default": 120}, (30, 30, 90)),
    ({"rest_sec": 120}, {}, (75, 120, 120)),
])
async def test_program_plan_rest_fallback_and_legacy_phase_rules(
    progression: str, week_phase: str, phase_index: int,
    exercise_rest: dict, day_rest: dict, expected: tuple[int, int, int],
) -> None:
    exercise = SimpleNamespace(id=uuid.uuid4(), name_ru="Жим гантелей лёжа")
    program = Program(
        name="Сохранённая программа", structure={
            "progression": progression,
            "schedule": [{
                "day_index": 1, "name": "Верх тела", **day_rest,
                "exercises": [{"exercise_id": str(exercise.id), **exercise_rest}],
            }],
        },
    )
    plan = await workout_service.build_plan_from_program_day(
        Session(exercise), program, 1, today=date(2026, 9, 28), week_phase=week_phase,
    )  # type: ignore[arg-type]
    assert plan["exercises"][0]["rest_sec"] == expected[phase_index]


def method(kind: str = "drop", *, slot: int = 4) -> dict:
    return {"set_number": slot, "kind": kind, "parts": [
        {"target_reps": 6, "target_weight": Decimal("40.00"), "pause_after_sec": 10},
        {"target_reps": 4, "target_weight": Decimal("30.00") if kind == "drop" else Decimal("40.00"),
         "pause_after_sec": 0},
    ]}


@pytest.mark.asyncio
@pytest.mark.parametrize("progression", ["linear", "phased"])
@pytest.mark.parametrize("week_phase", ["light", "medium", "heavy"])
@pytest.mark.parametrize("load_type,target,label", [
    ("weight_reps", {"kind": "weight_reps", "reps_min": 6, "reps_max": 8,
                     "target_weight": Decimal("40.00")}, "6-8"),
    ("reps_only", {"kind": "reps_only", "reps_min": 11, "reps_max": 11}, "11"),
    ("timed", {"kind": "timed", "duration_sec": 95}, "95с"),
    ("cardio_machine", {"kind": "timed", "duration_sec": 600}, "600с"),
])
@pytest.mark.parametrize("rest_sec", [0, 30, 120])
async def test_explicit_targets_round_trip_through_atomic_create_and_real_plan(
    progression, week_phase, load_type, target, label, rest_sec,
) -> None:
    exercise = SimpleNamespace(id=uuid.uuid4(), name_ru="Упражнение", equipment=None,
                               tags=[f"load:{load_type}"])
    raw = payload(exercise.id, progression=progression).model_dump(mode="json")
    raw["days"][0]["exercises"][0].update(target=target, weight_mode="per_hand", rest_sec=rest_sec)
    session = Session(exercise)
    program = await program_service.create_personal_program(
        session, user_id=uuid.uuid4(), data=PersonalProgramCreate.model_validate(raw),
    )
    stored = program.structure["schedule"][0]["exercises"][0]
    assert stored["target"]["kind"] == target["kind"]
    if load_type == "weight_reps":
        assert stored["target"]["target_weight"] == "40.00"
    assert session.commits == 1
    # Re-read JSON-shaped storage rather than passing an in-memory Pydantic object.
    program.structure = json.loads(json.dumps(program.structure))
    plan = await workout_service.build_plan_from_program_day(
        session, program, 1, today=date(2026, 9, 28), week_phase=week_phase,
    )
    assert plan["execution_version"] == 2
    row = plan["exercises"][0]
    assert row["target"] == stored["target"]
    assert row["target_reps"] == label
    assert row["rest_sec"] == rest_sec
    assert row["weight_mode"] == "per_hand"
    assert row.get("suggested_weight") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["drop", "cluster"])
async def test_groups_and_last_set_methods_survive_create_to_real_plan(kind) -> None:
    exercises = [SimpleNamespace(id=uuid.uuid4(), name_ru=f"Жим {i}", equipment=None,
                                 tags=["weight_reps"]) for i in range(2)]
    raw = payload(exercises[0].id).model_dump(mode="json")
    rows = raw["days"][0]["exercises"]
    rows[0]["set_methods"] = [method(kind)]
    rows.append({"exercise_id": str(exercises[1].id), "sets": 4, "reps": "8", "rest_sec": 0})
    group = {"id": str(uuid.uuid4()), "kind": "superset", "rounds": 4,
             "exercise_ids": [str(ex.id) for ex in exercises], "transition_sec": 0, "round_rest_sec": 0}
    raw["days"][0]["groups"] = [group]
    session = Session(exercises)
    program = await program_service.create_personal_program(
        session, user_id=uuid.uuid4(), data=PersonalProgramCreate.model_validate(raw),
    )
    day = program.structure["schedule"][0]
    assert day["groups"] == [group]
    assert day["exercises"][0]["set_methods"][0]["parts"][0]["target_weight"] == "40.00"
    plan = await workout_service.build_plan_from_program_day(session, program, 1)
    assert plan["execution_version"] == 2
    assert plan["groups"] == [group]
    assert plan["exercises"][0]["set_methods"] == day["exercises"][0]["set_methods"]
    assert plan["exercises"][1]["set_methods"] == []


@pytest.mark.parametrize("fault", ["duplicate", "slot", "overlap", "nonadjacent", "rounds", "missing", "group_size", "unknown", "day_unknown", "exercise_group"])
def test_personal_day_validates_full_topology_and_rejects_unknown_fields(fault) -> None:
    ids = [str(uuid.uuid4()) for _ in range(3)]
    raw = payload(uuid.UUID(ids[0])).model_dump(mode="json")
    day = raw["days"][0]
    day["exercises"] += [{"exercise_id": eid, "sets": 4, "reps": "8"} for eid in ids[1:]]
    group = {"id": str(uuid.uuid4()), "kind": "superset", "rounds": 4, "exercise_ids": ids[:2]}
    if fault == "duplicate":
        day["exercises"][1]["exercise_id"] = ids[0]
    elif fault == "slot":
        day["exercises"][0]["set_methods"] = [method(slot=5)]
    elif fault == "unknown":
        day["exercises"][0]["target_repps"] = "8"
    elif fault == "day_unknown":
        day["groops"] = []
    elif fault == "exercise_group":
        day["exercises"][0]["group"] = group
    else:
        day["groups"] = [group]
        if fault == "overlap":
            day["groups"].append({**group, "id": str(uuid.uuid4()), "exercise_ids": ids[1:]})
        elif fault == "nonadjacent":
            group["exercise_ids"] = [ids[0], ids[2]]
        elif fault == "rounds":
            group["rounds"] = 3
        elif fault == "missing":
            group["exercise_ids"] = [ids[0], str(uuid.uuid4())]
        elif fault == "group_size":
            group["exercise_ids"] = ids
    with pytest.raises(ValidationError):
        PersonalProgramCreate.model_validate(raw)


@pytest.mark.asyncio
@pytest.mark.parametrize("load_type,target_kind,has_method", [
    ("reps_only", "weight_reps", False), ("weight_reps", "reps_only", False),
    ("weight_reps", "timed", False), ("timed", "weight_reps", False),
    ("cardio_machine", "reps_only", False), ("timed", None, True),
    ("reps_only", None, True), ("cardio_machine", None, True),
])
async def test_incompatible_catalog_load_rejects_before_any_write(load_type, target_kind, has_method) -> None:
    exercise = SimpleNamespace(id=uuid.uuid4(), name_ru="Упражнение", equipment=None,
                               tags=[f"load:{load_type}"])
    raw = payload(exercise.id).model_dump(mode="json")
    row = raw["days"][0]["exercises"][0]
    if target_kind:
        row["target"] = ({"kind": "timed", "duration_sec": 60} if target_kind == "timed" else
                         {"kind": target_kind, "reps_min": 5, "reps_max": 8})
        if target_kind == "weight_reps":
            row["target"]["target_weight"] = None
    if has_method:
        row["set_methods"] = [method()]
    session = Session(exercise)
    with pytest.raises(HTTPException) as raised:
        await program_service.create_personal_program(
            session, user_id=uuid.uuid4(), data=PersonalProgramCreate.model_validate(raw),
        )
    assert raised.value.status_code == 422
    assert session.added is None
    assert session.commits == 0


@pytest.mark.asyncio
async def test_missing_exercise_rejects_before_any_write() -> None:
    session = Session([])
    with pytest.raises(HTTPException) as raised:
        await program_service.create_personal_program(session, user_id=uuid.uuid4(), data=payload(uuid.uuid4()))
    assert raised.value.status_code == 422
    assert session.added is None
    assert session.commits == 0


@pytest.mark.asyncio
async def test_wrong_catalog_exercise_rejects_safely_before_any_write() -> None:
    session = Session(SimpleNamespace(id=uuid.uuid4(), name_ru="Другое упражнение"))
    with pytest.raises(HTTPException) as raised:
        await program_service.create_personal_program(
            session, user_id=uuid.uuid4(), data=payload(uuid.uuid4()),
        )
    assert raised.value.status_code == 422
    assert session.added is None
    assert session.commits == 0


def test_personal_day_keeps_twelve_exercise_and_eight_set_limits() -> None:
    raw = payload(uuid.uuid4()).model_dump(mode="json")
    day = raw["days"][0]
    day["exercises"] = [
        {"exercise_id": str(uuid.uuid4()), "sets": 8, "reps": "8", "set_methods": [method(slot=8)]}
        for _ in range(12)
    ]
    day["groups"] = [{
        "id": str(uuid.uuid4()), "kind": "circuit", "rounds": 8,
        "exercise_ids": [row["exercise_id"] for row in day["exercises"]],
    }]
    assert len(PersonalProgramCreate.model_validate(raw).days[0].exercises) == 12
    day["exercises"][0]["sets"] = 9
    with pytest.raises(ValidationError):
        PersonalProgramCreate.model_validate(raw)
    day["exercises"][0]["sets"] = 8
    day["exercises"].append({"exercise_id": str(uuid.uuid4()), "sets": 1, "reps": "8"})
    with pytest.raises(ValidationError):
        PersonalProgramCreate.model_validate(raw)
