"""N07: real service paths with synthetic storage and exact deployed parser output.

Breaking mutations caught: omission loses target, null gets restored, fingerprints
ignore topology, target edits touch durable facts, goal weight becomes suggestion.
"""

from copy import deepcopy
from datetime import UTC, date, datetime
from decimal import Decimal
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

from fastapi import HTTPException
import pytest

from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout, WorkoutSet
from app.schemas.workout import WorkoutCreate, WorkoutPlan
from app.services import workout_service
from app.services.offline_schedule import schedule_fingerprint
from app.services.program_day_targets import apply_exercise_intent
from app.services.workout_preparation import plan_fingerprint

FIXTURE = Path(__file__).resolve().parents[2] / "frontend/tests/fixtures/apk26"


def load(name):
    return json.loads((FIXTURE / f"{name}.json").read_text(encoding="utf-8"))


def context(mode="offline"):
    bundle = load("typed-bundle")
    expected = bundle["plans"][0]["plan"]
    user = User(id=UUID(bundle["owner"]), goals={"active_program_id": bundle["program"]["id"]})
    program = SimpleNamespace(
        id=UUID(bundle["program"]["id"]),
        version=7,
        is_deleted=False,
        owner_id=user.id,
        publication_status="draft",
        is_template=False,
    )
    plan = load(f"{mode}-parsed")["plans"][0]["plan"]
    stamp = {
        "prepared_at": datetime.now(UTC),
        "schedule_fingerprint": schedule_fingerprint(user.goals),
        "plan_fingerprint": plan_fingerprint(
            user,
            program,
            expected,
            scheduled_date=date(2026, 10, 25),
            day_index=1,
            week_phase="medium",
            cycle_readiness="normal",
        ),
    }
    raw = {
        "scheduled_date": "2026-10-25",
        "program_id": str(program.id),
        "client_workout_id": str(uuid4()),
        "day_index": 1,
        "week_phase": "medium",
        "cycle_readiness": "normal",
        "execution_version": 2,
        "preparation": stamp,
        "plan": plan,
    }
    return user, program, expected, raw


class MemorySession:
    """Only database operations are synthetic; production validation/persistence run."""

    def __init__(self, program):
        self.program = program
        self.added = []
        self.commits = 0

    async def execute(self, statement):
        return None

    async def scalar(self, statement):
        return self.program if statement.column_descriptions[0].get("entity") is Program else None

    async def scalars(self, statement):
        ids = next(iter(statement.compile().params.values()))
        return SimpleNamespace(
            all=lambda: [
                SimpleNamespace(
                    id=UUID(row["exercise_id"]),
                    name_ru="Тест",
                    tags=["load:weight_reps"],
                    equipment=None,
                )
                for row in load("typed-bundle")["plans"][0]["plan"]["exercises"]
                if UUID(row["exercise_id"]) in ids
            ]
        )

    async def refresh(self, *args, **kwargs):
        pass

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if isinstance(obj, Workout) and obj.id is None:
                obj.id = uuid4()

    async def commit(self):
        self.commits += 1


def install_create(monkeypatch, session, expected):
    # Canonical server plan retrieval is isolated from DB, not its validators.
    monkeypatch.setattr(
        workout_service, "build_program_plan_for_user", AsyncMock(return_value=deepcopy(expected))
    )

    async def get_saved(*args, **kwargs):
        return next(obj for obj in session.added if isinstance(obj, Workout))

    monkeypatch.setattr(workout_service, "_get_workout_for_user", get_saved)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["online", "offline"])
async def test_frozen_old_prepared_post_persists_canonical_target(monkeypatch, mode):
    user, program, expected, raw = context(mode)
    data = WorkoutCreate.model_validate(raw)
    assert "target" not in data.plan.exercises[0].model_fields_set
    session = MemorySession(program)
    install_create(monkeypatch, session, expected)
    workout = await workout_service.create_workout(session, user, data)
    assert session.commits == 1
    assert workout.plan["exercises"][0]["target"]["target_weight"] == "40.00"
    assert workout.plan["exercises"][1]["target"] == {"kind": "timed", "duration_sec": 30}
    assert workout.plan["exercises"][0]["suggested_weight"] == "17.5"
    slots = [obj for obj in session.added if isinstance(obj, WorkoutSet)]
    assert len(slots) == 6
    assert slots[0].weight is None and slots[0].reps is None
    assert slots[0].note == "Моя заметка\nЦель: 40 кг на руку"
    assert slots[2].parts[0].status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [
        "null",
        "target",
        "identity",
        "order",
        "rest",
        "method",
        "group",
        "phase",
        "schedule",
        "stamp",
        "revision",
        "program_version",
        "owner",
        "date",
    ],
)
async def test_old_prepared_tampering_never_persists(monkeypatch, change):
    user, program, expected, raw = context()
    row = raw["plan"]["exercises"][0]
    if change == "null":
        row["target"] = None
    elif change == "target":
        row["target"] = {
            "kind": "weight_reps",
            "reps_min": 8,
            "reps_max": 12,
            "target_weight": "41",
        }
    elif change == "identity":
        new = str(uuid4())
        raw["plan"]["groups"][0]["exercise_ids"][0] = new
        row["exercise_id"] = new
    elif change == "order":
        row["order"], raw["plan"]["exercises"][1]["order"] = 2, 1
        raw["plan"]["groups"][0]["exercise_ids"].reverse()
    elif change == "rest":
        row["rest_sec"] += 1
    elif change == "method":
        row["set_methods"][0]["parts"][0]["target_reps"] += 1
    elif change == "group":
        raw["plan"]["groups"][0]["transition_sec"] += 1
    elif change == "phase":
        raw["week_phase"] = "heavy"
    elif change == "schedule":
        raw["preparation"]["schedule_fingerprint"] = "f" * 64
    elif change == "stamp":
        raw["preparation"]["plan_fingerprint"] = "f" * 64
    elif change == "revision":
        raw["plan"]["customization_revisions"]["program_day"] += 1
    elif change == "program_version":
        program.version += 1
    elif change == "owner":
        user.id = uuid4()
        program.owner_id = user.id  # Access allowed; the old owner-bound stamp must still fail.
    elif change == "date":
        raw["scheduled_date"] = "2026-10-26"
    data = WorkoutCreate.model_validate(raw)
    if change == "null":
        assert "target" in data.plan.exercises[0].model_fields_set
    session = MemorySession(program)
    install_create(monkeypatch, session, expected)
    with pytest.raises(HTTPException) as caught:
        await workout_service.create_workout(session, user, data)
    assert caught.value.status_code == 409
    assert session.commits == 0 and session.added == []


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["omitted", "null", "changed", "identity", "order", "completed"])
async def test_old_whole_plan_put_retains_target_and_facts(monkeypatch, change):
    user, program, expected, raw = context()
    existing = SimpleNamespace(
        id=uuid4(),
        plan=deepcopy(expected),
        status="completed" if change == "completed" else "active",
        sets=[
            SimpleNamespace(
                id=uuid4(),
                exercise_id=UUID(expected["exercises"][0]["exercise_id"]),
                set_number=1,
                is_completed=True,
                weight=Decimal("39"),
                execution_revision=4,
                parts=[{"status": "completed"}],
                receipts=["unchanged"],
            )
        ],
    )
    facts = deepcopy(vars(existing.sets[0]))
    incoming = raw["plan"]
    if change == "null":
        incoming["exercises"][0]["target"] = None
    if change == "changed":
        incoming["exercises"][0]["target"] = {"kind": "timed", "duration_sec": 31}
    if change == "identity":
        new = str(uuid4())
        incoming["exercises"][0]["exercise_id"] = new
        incoming["groups"][0]["exercise_ids"][0] = new
    if change == "order":
        incoming["exercises"][0]["order"], incoming["exercises"][1]["order"] = 2, 1
        incoming["groups"][0]["exercise_ids"].reverse()
    data = WorkoutPlan.model_validate(incoming)
    session = MemorySession(program)
    monkeypatch.setattr(workout_service, "_get_workout_for_user", AsyncMock(return_value=existing))
    monkeypatch.setattr(
        workout_service.workout_execution, "lock_workout", AsyncMock(return_value=existing)
    )
    if change == "omitted":
        result = await workout_service.update_workout_plan(session, user, existing.id, data)
        assert result.plan["exercises"][0]["target"]["target_weight"] == "40.00"
        assert session.commits == 1
    else:
        with pytest.raises(HTTPException) as caught:
            await workout_service.update_workout_plan(session, user, existing.id, data)
        assert caught.value.status_code == (400 if change == "completed" else 409)
        assert session.commits == 0
        assert existing.plan == expected
    assert vars(existing.sets[0]) == facts


@pytest.mark.parametrize("mode,label", [("per_hand", "на руку"), ("total", "суммарно"), (None, "")])
def test_explicit_weight_readable_note_preserves_user_text_without_duplicates(mode, label):
    item = {
        "target": {"kind": "weight_reps", "reps_min": 8, "reps_max": 12, "target_weight": "40.00"}
    }
    row = {"note": "Моя заметка", "weight_mode": mode, "suggested_weight": "17.50"}
    apply_exercise_intent(item, row)
    suffix = f"Цель: 40 кг{(' ' + label) if label else ''}"
    assert row["note"] == "Моя заметка\n" + suffix
    apply_exercise_intent(item, row)
    assert row["note"] == "Моя заметка\n" + suffix
    assert row["suggested_weight"] == "17.50"


def test_long_user_note_plus_maximum_weight_remains_valid_and_null_invents_nothing():
    item = {
        "target": {
            "kind": "weight_reps",
            "reps_min": 1,
            "reps_max": 100000,
            "target_weight": "10000.00",
        }
    }
    row = {"exercise_id": str(uuid4()), "order": 1, "note": "я" * 500, "weight_mode": "per_hand"}
    apply_exercise_intent(item, row)
    assert row["note"] == "я" * 500 + "\nЦель: 10000 кг на руку"
    assert (
        WorkoutPlan.model_validate({"execution_version": 2, "exercises": [row]}).exercises[0].note
        == row["note"]
    )
    untouched = {"note": "Оригинал", "suggested_weight": "17.5"}
    item["target"]["target_weight"] = None
    apply_exercise_intent(item, untouched)
    assert untouched["note"] == "Оригинал"
    assert untouched["suggested_weight"] == "17.5"


@pytest.mark.asyncio
@pytest.mark.parametrize("override", [False, True])
async def test_authoritative_builders_label_final_note_and_mode_before_fingerprint(
    monkeypatch, override
):
    from app.schemas.workout_customization import WorkoutDayPatch
    from app.services import workout_customization
    from tests.test_personal_programs import Session

    eid = uuid4()
    exercise = SimpleNamespace(id=eid, name_ru="Жим", tags=["load:weight_reps"], equipment=None)
    session = Session(exercise)
    program = SimpleNamespace(
        id=uuid4(),
        version=1,
        name="План",
        workout_type="custom",
        structure={
            "progression": "linear",
            "schedule": [
                {
                    "day_index": 1,
                    "exercises": [
                        {
                            "exercise_id": str(eid),
                            "sets": 3,
                            "reps": "8-12",
                            "rest_sec": 60,
                            "weight_mode": "total",
                            "note": "Исходная заметка",
                            "target": {
                                "kind": "weight_reps",
                                "reps_min": 8,
                                "reps_max": 12,
                                "target_weight": "40.00",
                            },
                        }
                    ],
                }
            ],
        },
    )
    user = SimpleNamespace(
        id=uuid4(), goals={"active_program_id": str(program.id)}, anthropometry={}
    )

    async def customize(session, *, base_plan, scopes, **kwargs):
        if override and scopes == ("program_day",):
            return await workout_customization.apply_day_patch(
                session,
                base_plan,
                WorkoutDayPatch.model_validate(
                    {"exercise_overrides": [{"exercise_id": str(eid), "note": "Личная заметка"}]}
                ),
            )
        return base_plan

    async def saved(session, *, base_plan, **kwargs):
        return base_plan

    monkeypatch.setattr(workout_customization, "apply_customizations", customize)
    monkeypatch.setattr(workout_service.planned_workout, "apply_saved_override", saved)
    base = await workout_service.build_plan_from_program_day(
        session, program, 1, week_phase="medium"
    )
    assert base["exercises"][0]["note"] == "Исходная заметка\nЦель: 40 кг суммарно"
    expected_note = (
        "Личная заметка\nЦель: 40 кг суммарно"
        if override
        else "Исходная заметка\nЦель: 40 кг суммарно"
    )
    plan = await workout_service.build_program_plan_for_user(
        session, user, program, day_index=1, scheduled_date=date(2026, 10, 25), week_phase="medium"
    )
    assert plan["exercises"][0]["note"] == expected_note
    parsed = WorkoutPlan.model_validate(plan)
    assert parsed.exercises[0].suggested_weight is None
    stamp = plan_fingerprint(
        user,
        program,
        plan,
        scheduled_date=date(2026, 10, 25),
        day_index=1,
        week_phase="medium",
        cycle_readiness="normal",
    )
    raw = parsed.model_dump(mode="json")
    raw["exercises"][0]["note"] += "!"
    assert stamp != plan_fingerprint(
        user,
        program,
        raw,
        scheduled_date=date(2026, 10, 25),
        day_index=1,
        week_phase="medium",
        cycle_readiness="normal",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("note_kind", ["changed", "omitted", "long", "canonical_bound"])
async def test_whole_plan_put_finalizes_edited_note_and_repeat_without_duplicate(
    monkeypatch, note_kind
):
    user, program, expected, raw = context()
    fact = SimpleNamespace(
        id=uuid4(),
        exercise_id=UUID(expected["exercises"][0]["exercise_id"]),
        set_number=1,
        is_completed=True,
        weight=Decimal("39"),
        execution_revision=4,
        parts=[{"status": "completed"}],
        receipts=["unchanged"],
    )
    existing = SimpleNamespace(id=uuid4(), plan=deepcopy(expected), status="active", sets=[fact])
    before = deepcopy(vars(fact))
    if note_kind == "long":
        expected["exercises"][0]["target"]["target_weight"] = "10000.00"
        existing.plan = deepcopy(expected)
    incoming = raw["plan"]
    incoming["title"] = "Разрешённый новый заголовок"
    incoming["exercises"][0].pop("name_ru", None)
    if note_kind == "omitted":
        incoming["exercises"][0].pop("note")
        want = "Цель: 40 кг на руку"
    elif note_kind == "canonical_bound":
        suffix = "\nЦель: 40 кг на руку"
        want = "я" * (600 - len(suffix)) + suffix
        incoming["exercises"][0]["note"] = want
    else:
        text = "я" * 500 if note_kind == "long" else "Новая заметка"
        incoming["exercises"][0]["note"] = text
        want = text + (
            "\nЦель: 10000 кг на руку" if note_kind == "long" else "\nЦель: 40 кг на руку"
        )
    data = WorkoutPlan.model_validate(incoming)
    assert "target" not in data.exercises[0].model_fields_set
    session = MemorySession(program)
    monkeypatch.setattr(workout_service, "_get_workout_for_user", AsyncMock(return_value=existing))
    monkeypatch.setattr(
        workout_service.workout_execution, "lock_workout", AsyncMock(return_value=existing)
    )
    result = await workout_service.update_workout_plan(session, user, existing.id, data)
    assert result.plan["exercises"][0]["note"] == want
    assert result.plan["title"] == "Разрешённый новый заголовок"
    assert result.plan["exercises"][0]["name_ru"] is None
    assert result.plan["exercises"][0]["target"]["target_weight"] == (
        "10000.00" if note_kind == "long" else "40.00"
    )
    assert WorkoutPlan.model_validate(result.plan).exercises[0].note == want
    assert vars(fact) == before
    assert session.commits == 1
    # Keep the old fixture's absent target, but send the returned visible note.
    repeat = deepcopy(incoming)
    repeat["exercises"][0]["note"] = result.plan["exercises"][0]["note"]
    result = await workout_service.update_workout_plan(
        session, user, existing.id, WorkoutPlan.model_validate(repeat)
    )
    assert result.plan["exercises"][0]["note"] == want
    assert vars(fact) == before
    assert session.commits == 2


@pytest.mark.asyncio
async def test_whole_plan_put_rejects_derived_note_beyond_execution_bound(monkeypatch):
    user, program, expected, raw = context()
    existing = SimpleNamespace(id=uuid4(), plan=deepcopy(expected), status="active", sets=[])
    raw["plan"]["exercises"][0]["note"] = "я" * 600
    data = WorkoutPlan.model_validate(raw["plan"])
    session = MemorySession(program)
    monkeypatch.setattr(workout_service, "_get_workout_for_user", AsyncMock(return_value=existing))
    monkeypatch.setattr(
        workout_service.workout_execution, "lock_workout", AsyncMock(return_value=existing)
    )
    with pytest.raises(HTTPException) as caught:
        await workout_service.update_workout_plan(session, user, existing.id, data)
    assert caught.value.status_code == 422
    assert session.commits == 0
    assert existing.plan == expected


@pytest.mark.asyncio
async def test_whole_plan_put_keeps_no_target_note_at_existing_bound(monkeypatch):
    user, program, expected, raw = context()
    expected["exercises"][0].pop("target")
    existing = SimpleNamespace(id=uuid4(), plan=deepcopy(expected), status="active", sets=[])
    raw["plan"]["exercises"][0]["note"] = "я" * 600
    session = MemorySession(program)
    monkeypatch.setattr(workout_service, "_get_workout_for_user", AsyncMock(return_value=existing))
    monkeypatch.setattr(
        workout_service.workout_execution, "lock_workout", AsyncMock(return_value=existing)
    )
    result = await workout_service.update_workout_plan(
        session, user, existing.id, WorkoutPlan.model_validate(raw["plan"])
    )
    assert result.plan["exercises"][0]["note"] == "я" * 600
    assert result.plan["exercises"][0]["target"] is None
    assert session.commits == 1
