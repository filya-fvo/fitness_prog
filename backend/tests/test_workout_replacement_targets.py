"""Replacement keeps explicit intent only when the final catalog load supports it."""

from copy import deepcopy
from datetime import date
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.models.exercise import Exercise
from app.models.user_program_day_override import UserProgramDayOverride
from app.models.workout_plan_override import WorkoutPlanOverride
from app.schemas.workout_customization import WorkoutCustomizationRequest, WorkoutDayPatch
from app.services import planned_workout, program_service, workout_customization, workout_service


class Session:
    def __init__(self, rows):
        self.rows = rows
        self.added = []
        self.commits = 0
        self.saved = None

    async def scalars(self, statement):
        if statement.column_descriptions[0].get("entity") is not Exercise:
            return SimpleNamespace(all=lambda: [])
        ids = next(iter(statement.compile().params.values()))
        return SimpleNamespace(all=lambda: [row for row in self.rows if row.id in ids])

    async def scalar(self, statement):
        return (
            self.saved
            if statement.column_descriptions[0].get("entity") is UserProgramDayOverride
            else None
        )

    async def execute(self, *args, **kwargs):
        pass

    def add(self, row):
        self.added.append(row)

    async def commit(self):
        self.commits += 1


def catalog(eid, kind):
    return SimpleNamespace(id=eid, name_ru="Упражнение", equipment=None, tags=[f"load:{kind}"])


def plan(target, *, methods=False):
    row = {
        "exercise_id": str(uuid4()),
        "order": 1,
        "target_sets": 3,
        "target_reps": "8-12",
        "rest_sec": 90,
        "weight_mode": "per_hand",
        "suggested_weight": 17.5,
        "note": "Моя заметка",
    }
    if target is not None:
        row["target"] = target
    if methods:
        row["set_methods"] = [
            {
                "set_number": 1,
                "kind": "cluster",
                "parts": [
                    {"target_reps": 4, "target_weight": "40", "pause_after_sec": 20},
                    {"target_reps": 3, "target_weight": "40", "pause_after_sec": 0},
                ],
            }
        ]
    return {"execution_version": 2, "exercises": [row]}


WEIGHT = {"kind": "weight_reps", "reps_min": 8, "reps_max": 12, "target_weight": "40.00"}
REPS = {"kind": "reps_only", "reps_min": 8, "reps_max": 12}
TIME = {"kind": "timed", "duration_sec": 95}


async def replace(path, session, base, target_id):
    source = base["exercises"][0]["exercise_id"]
    if path == "historical":
        return await planned_workout.apply_replacements(
            session, base, [{"from_exercise_id": source, "to_exercise_id": str(target_id)}]
        )
    return await workout_customization.apply_day_patch(
        session,
        base,
        WorkoutDayPatch.model_validate(
            {
                "exercise_overrides": [
                    {"exercise_id": source, "replacement_exercise_id": str(target_id)}
                ]
            }
        ),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["historical", "modern"])
@pytest.mark.parametrize(
    "target,kind",
    [(WEIGHT, "timed"), (REPS, "weight_reps"), (TIME, "reps_only"), (WEIGHT, "cardio_machine")],
)
async def test_replacement_rejects_incompatible_preserved_target_without_mutation(
    path, target, kind
):
    base = plan(target)
    before = deepcopy(base)
    eid = uuid4()
    session = Session([catalog(eid, kind)])
    with pytest.raises(HTTPException) as caught:
        await replace(path, session, base, eid)
    assert caught.value.status_code == 422
    assert "нагруз" in caught.value.detail
    assert base == before
    assert session.added == [] and session.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["historical", "modern"])
@pytest.mark.parametrize(
    "target,kind,methods",
    [
        (WEIGHT, "weight_reps", True),
        (REPS, "reps_only", False),
        (TIME, "timed", False),
        (TIME, "cardio_machine", False),
    ],
)
async def test_compatible_replacement_preserves_intent_rest_mode_and_parts(
    path, target, kind, methods
):
    base = plan(target, methods=methods)
    before = deepcopy(base)
    eid = uuid4()
    result = await replace(path, Session([catalog(eid, kind)]), base, eid)
    row = result["exercises"][0]
    assert row["exercise_id"] == str(eid)
    assert row["target"] == target
    assert row["rest_sec"] == 90 and row["weight_mode"] == "per_hand"
    assert row.get("set_methods", []) == before["exercises"][0].get("set_methods", [])
    assert row.get("suggested_weight") is None
    assert base == before


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["historical", "modern"])
async def test_replacement_without_typed_target_keeps_legacy_behavior(path):
    base = plan(None)
    eid = uuid4()
    result = await replace(path, Session([catalog(eid, "timed")]), base, eid)
    assert result["exercises"][0].get("target") is None
    assert result["exercises"][0]["target_reps"] == "8-12"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["timed", "missing"])
async def test_modern_save_rechecks_final_catalog_before_any_draft_write(monkeypatch, kind):
    base = plan(WEIGHT)
    before = deepcopy(base)
    eid = UUID(base["exercises"][0]["exercise_id"])
    session = Session([] if kind == "missing" else [catalog(eid, kind)])
    user = SimpleNamespace(id=uuid4(), goals={})
    program = SimpleNamespace(id=uuid4(), version=1)

    async def get_program(*args, **kwargs):
        return program

    async def build(*args, **kwargs):
        return base

    monkeypatch.setattr(program_service, "get_program", get_program)
    monkeypatch.setattr(workout_service, "build_plan_from_program_day", build)
    request = WorkoutCustomizationRequest(
        program_id=program.id,
        day_index=1,
        scope="occurrence",
        scheduled_date="2026-10-26",
        base_revision=0,
        operation_id=uuid4(),
        patch={},
    )
    with pytest.raises(HTTPException) as caught:
        await workout_customization.save_customization(session, user, request)
    assert caught.value.status_code == 422
    assert base == before
    assert session.added == [] and session.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["timed", "weight_reps"])
async def test_modern_save_replacement_preserves_existing_draft_on_rejection(monkeypatch, kind):
    base = plan(WEIGHT, methods=False)
    before = deepcopy(base)
    eid = uuid4()
    session = Session([catalog(eid, kind)])
    user = SimpleNamespace(id=uuid4(), goals={})
    program = SimpleNamespace(id=uuid4(), version=1)
    session.saved = UserProgramDayOverride(
        user_id=user.id,
        program_id=program.id,
        day_index=1,
        scheduled_date="2026-10-26",
        revision=0,
        program_version=1,
        patch={},
        is_deleted=False,
    )
    original_patch = deepcopy(session.saved.patch)

    async def get_program(*args, **kwargs):
        return program

    async def build(*args, **kwargs):
        return base

    monkeypatch.setattr(program_service, "get_program", get_program)
    monkeypatch.setattr(workout_service, "build_plan_from_program_day", build)
    request = WorkoutCustomizationRequest(
        program_id=program.id,
        day_index=1,
        scope="occurrence",
        scheduled_date="2026-10-26",
        base_revision=0,
        operation_id=uuid4(),
        patch={
            "exercise_overrides": [
                {
                    "exercise_id": base["exercises"][0]["exercise_id"],
                    "replacement_exercise_id": str(eid),
                }
            ]
        },
    )
    if kind == "timed":
        with pytest.raises(HTTPException) as caught:
            await workout_customization.save_customization(session, user, request)
        assert caught.value.status_code == 422
        assert session.saved.patch == original_patch and session.saved.revision == 0
        assert session.commits == 0
    else:
        result = await workout_customization.save_customization(session, user, request)
        assert result.revision == 1
        assert result.patch.exercise_overrides[0].replacement_exercise_id == eid
        assert session.commits == 1
    assert base == before and session.added == []


@pytest.mark.asyncio
async def test_legacy_save_still_rejects_execution_v2_before_writing():
    from app.schemas.workout import PlannedWorkoutReplacement

    session = Session([])
    base = plan(WEIGHT)
    with pytest.raises(HTTPException) as caught:
        await planned_workout.save_override(
            session,
            user_id=uuid4(),
            program_id=uuid4(),
            scheduled_date="2026-10-26",
            day_index=1,
            week_phase="medium",
            base_plan=base,
            replacements=[
                PlannedWorkoutReplacement(
                    from_exercise_id=base["exercises"][0]["exercise_id"], to_exercise_id=uuid4()
                )
            ],
        )
    assert caught.value.status_code == 409
    assert session.added == [] and session.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["historical", "modern"])
async def test_replacement_still_rejects_method_only_on_incompatible_load(path):
    base = plan(None, methods=True)
    before = deepcopy(base)
    eid = uuid4()
    with pytest.raises(HTTPException) as caught:
        await replace(path, Session([catalog(eid, "timed")]), base, eid)
    assert caught.value.status_code == 422
    assert base == before


class ResetSession(Session):
    """Synthetic rows retain both scopes; actual service applies their precedence."""

    async def scalars(self, statement):
        if statement.column_descriptions[0].get("entity") is UserProgramDayOverride:
            rows = (
                [self.occurrence]
                if "scheduled_date IS NOT NULL" in str(statement)
                else [self.persistent, self.occurrence]
            )
            return SimpleNamespace(all=lambda: rows)
        return await super().scalars(statement)

    async def scalar(self, statement):
        if statement.column_descriptions[0].get("entity") is WorkoutPlanOverride:
            return self.legacy
        return await super().scalar(statement)

    async def delete(self, row):
        self.deleted.append(row)


def reset_context(monkeypatch, kind, *, scope="occurrence"):
    base = plan(None)
    eid = UUID(base["exercises"][0]["exercise_id"])
    session = ResetSession([] if kind == "missing" else [catalog(eid, kind)])
    user = SimpleNamespace(id=uuid4(), goals={})
    program = SimpleNamespace(id=uuid4(), version=1)
    session.persistent = UserProgramDayOverride(
        user_id=user.id,
        program_id=program.id,
        day_index=1,
        scheduled_date=None,
        revision=1,
        program_version=1,
        is_deleted=False,
        patch={
            "exercise_overrides": [
                {
                    "exercise_id": str(eid),
                    "set_methods": plan(None, methods=True)["exercises"][0]["set_methods"],
                }
            ]
        },
    )
    session.occurrence = UserProgramDayOverride(
        user_id=user.id,
        program_id=program.id,
        day_index=1,
        scheduled_date=date(2026, 10, 26),
        revision=1,
        program_version=1,
        is_deleted=False,
        patch={"exercise_overrides": [{"exercise_id": str(eid), "set_methods": []}]},
    )
    session.saved = session.occurrence if scope == "occurrence" else session.persistent
    session.legacy = WorkoutPlanOverride(
        user_id=user.id,
        program_id=program.id,
        scheduled_date=date(2026, 10, 26),
        day_index=1,
        replacements=[],
    )
    session.deleted = []

    async def get_program(*args, **kwargs):
        return program

    async def build(*args, **kwargs):
        return base

    monkeypatch.setattr(program_service, "get_program", get_program)
    monkeypatch.setattr(workout_service, "build_plan_from_program_day", build)
    request = WorkoutCustomizationRequest(
        program_id=program.id,
        day_index=1,
        scope=scope,
        scheduled_date=date(2026, 10, 26) if scope == "occurrence" else None,
        base_revision=1,
        operation_id=uuid4(),
        patch={},
    )
    return session, user, program, request, base


def stored_override_state(row):
    return deepcopy(
        {
            field: getattr(row, field)
            for field in (
                "patch",
                "revision",
                "is_deleted",
                "last_operation_id",
                "last_operation_hash",
                "program_version",
            )
        }
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["timed", "missing"])
async def test_occurrence_reset_rejects_invalid_retained_inheritance_before_mutation(
    monkeypatch, kind
):
    session, user, _, request, base = reset_context(monkeypatch, kind)
    occurrence_before = stored_override_state(session.occurrence)
    persistent_before = stored_override_state(session.persistent)
    base_before = deepcopy(base)
    with pytest.raises(HTTPException) as caught:
        await workout_customization.reset_customization(session, user, request)
    assert caught.value.status_code == 422
    assert stored_override_state(session.occurrence) == occurrence_before
    assert stored_override_state(session.persistent) == persistent_before
    assert base == base_before
    assert session.added == [] and session.deleted == [] and session.commits == 0


@pytest.mark.asyncio
async def test_occurrence_reset_retains_compatible_persistent_methods(monkeypatch):
    session, user, program, request, base = reset_context(monkeypatch, "weight_reps")
    persistent_before = stored_override_state(session.persistent)
    base_before = deepcopy(base)
    result = await workout_customization.reset_customization(session, user, request)
    assert result.revision == 2
    assert session.occurrence.patch == {} and session.occurrence.is_deleted is True
    assert stored_override_state(session.persistent) == persistent_before
    retained = await workout_customization.apply_customizations(
        session,
        user_id=user.id,
        program_id=program.id,
        day_index=1,
        scheduled_date=request.scheduled_date,
        base_plan=base,
    )
    assert retained["exercises"][0]["set_methods"][0]["kind"] == "cluster"
    assert session.added == [] and session.deleted == [session.legacy] and session.commits == 1
    assert base == base_before


@pytest.mark.asyncio
async def test_program_day_reset_removes_its_methods_and_preserves_date_patch(monkeypatch):
    session, user, _, request, base = reset_context(monkeypatch, "timed", scope="program_day")
    occurrence_before = stored_override_state(session.occurrence)
    base_before = deepcopy(base)
    result = await workout_customization.reset_customization(session, user, request)
    assert result.revision == 2
    assert session.persistent.patch == {} and session.persistent.is_deleted is True
    assert stored_override_state(session.occurrence) == occurrence_before
    assert session.added == [] and session.deleted == [] and session.commits == 1
    assert base == base_before
