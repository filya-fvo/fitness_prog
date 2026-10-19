"""Completed compound parts contribute load without inventing a continuous lift."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
import pytest
from app.schemas.workout import WorkoutCompleteRequest, WorkoutSetCreate
from app.services import progress_dashboard, workout_service
from app.services.workout_metrics import aggregate_workout_load, normalized_set_volume
from tests.test_workout_customization import database as database
from tests.test_workout_execution import create_method_workout


def compound(kind="cluster", statuses=("completed", "completed", "completed"), mode=None):
    weights = [100, 100, 100] if kind == "cluster" else [30, 25, 20]
    reps = [4, 4, 4] if kind == "cluster" else [10, 8, 8]
    return SimpleNamespace(execution_kind=kind, is_completed=all(s != "pending" for s in statuses) and "completed" in statuses,
        reps=None, weight=None, duration_sec=None, weight_mode=mode, is_deleted=False,
        parts=[SimpleNamespace(reps=r, weight=Decimal(w), status=s, duration_sec=None, is_deleted=False)
            for r, w, s in zip(reps, weights, statuses)])


@pytest.mark.parametrize("kind,statuses,mode,expected", [
    ("drop", ("completed",)*3, None, 660), ("cluster", ("completed",)*3, None, 1200),
    ("cluster", ("completed", "completed", "pending"), None, 800),
    ("cluster", ("completed", "skipped", "pending"), "per_hand", 800),
    ("drop", ("completed",)*3, "per_hand", 1320),
    ("cluster", ("skipped", "pending", "pending"), None, 0),
])
def test_python_metrics_count_actual_parts_once(kind, statuses, mode, expected):
    row = compound(kind, statuses, mode)
    assert normalized_set_volume(row) == expected
    metrics = aggregate_workout_load([row])
    assert metrics.weighted_volume_kg_reps == expected
    assert metrics.weighted_parts == statuses.count("completed")


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,partial,mode,expected", [("drop", False, None, 660), ("cluster", False, None, 1200),
    ("cluster", True, None, 800), ("cluster", True, "per_hand", 1600)])
async def test_real_dashboard_and_diary_include_parts_but_strength_does_not(database, kind, partial, mode, expected):
    from app.services.exercise_progress import get_exercise_progress
    from app.services.workout_load_hints import load_hints_for_exercises
    from app.ai.workout_reports import _load_lines
    from app.services.competition_analytics import _best_lift
    from app.services.strength_trends import _history_by_exercise
    session, owner, workout = await create_method_workout(database, kind)
    parent = workout.sets[0]
    values = compound(kind, ("completed", "completed", "pending") if partial else ("completed",)*3, mode)
    parts = [{"id": part.id, "ordinal": part.ordinal, "reps": fact.reps if fact.status == "completed" else None,
        "weight": fact.weight if fact.status == "completed" else None, "status": fact.status, "rest_after_sec": part.rest_after_sec}
        for part, fact in zip(parent.parts, values.parts)]
    await workout_service.add_workout_set(session, owner, workout.id, WorkoutSetCreate(exercise_id=parent.exercise_id, set_number=1,
        execution_version=2, execution_kind=kind, base_execution_revision=0, client_operation_id=uuid4(), weight_mode=mode, parts=parts))
    workout = await workout_service.complete_workout(session, owner, workout.id, WorkoutCompleteRequest(execution_version=2))
    day = date(2026, 10, 19)
    daily = (await session.execute(progress_dashboard._daily_set_statement(user_id=owner.id, start=day, end=day))).mappings().one()
    assert daily["volume_kg"] == expected
    assert daily["completed_sets"] == (0 if partial else 1)
    muscle = (await session.execute(progress_dashboard._muscle_group_statement(user_id=owner.id, start=day, end=day))).mappings().one()
    assert muscle["volume_kg"] == expected
    result = await get_exercise_progress(session, user_id=owner.id, exercise_id=parent.exercise_id, date_from=day, date_to=day, include_compound=True)
    assert result["points"] == []
    assert len(result["diary"]) == 1
    assert result["diary"][0]["sets"][0]["execution_kind"] == kind
    assert [part["status"] for part in result["diary"][0]["sets"][0]["parts"]] == [p["status"] for p in parts]
    assert await load_hints_for_exercises(session, user_id=owner.id, exercise_ids=[parent.exercise_id]) == []
    assert f"{expected} кг·повт" in " ".join(_load_lines([workout]))
    assert await _best_lift(session, owner.id, parent.exercise_id, day, day) is None
    assert parent.exercise_id not in await _history_by_exercise(session, user_id=owner.id, period_start=day, period_end=day)
    daily_workouts = (await session.execute(progress_dashboard._daily_workout_statement(user_id=owner.id, start=day, end=day))).mappings().one()
    assert daily_workouts["completed_workouts"] == 1
    legacy = await get_exercise_progress(session, user_id=owner.id, exercise_id=parent.exercise_id, date_from=day, date_to=day, include_compound=False)
    assert legacy["points"] == [] and legacy["diary"] == []
    assert (await session.execute(progress_dashboard._daily_set_statement(user_id=database[2].id, start=day, end=day))).mappings().all() == []
    saved_parent = workout.sets[0]
    saved_parent.parts[0].is_deleted = True
    await session.flush()
    changed = (await session.execute(progress_dashboard._daily_set_statement(user_id=owner.id, start=day, end=day))).mappings().one()
    assert changed["volume_kg"] == expected - values.parts[0].weight * values.parts[0].reps * (2 if mode == "per_hand" else 1)
    saved_parent.is_deleted = True
    await session.flush()
    assert (await session.execute(progress_dashboard._daily_set_statement(user_id=owner.id, start=day, end=day))).mappings().all() == []


@pytest.mark.asyncio
async def test_ordinary_group_member_keeps_strength_and_hint_and_counts_once(database):
    from app.schemas.workout import WorkoutCreate
    from app.services.exercise_progress import get_exercise_progress
    from app.services.strength_trends import _history_by_exercise
    from app.services.workout_load_hints import load_hints_for_exercises
    session, owner, _, _, other_exercise, base, _ = database
    day = date(2026, 10, 19)
    plan = {"execution_version": 2, "exercises": [{"exercise_id": str(ex.id), "order": index + 1, "target_sets": 1}
        for index, ex in enumerate([base, other_exercise])], "groups": [{"id": str(uuid4()), "kind": "superset",
        "exercise_ids": [str(base.id), str(other_exercise.id)], "rounds": 1}]}
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(scheduled_date=day, execution_version=2, plan=plan))
    await workout_service.add_workout_set(session, owner, workout.id, WorkoutSetCreate(exercise_id=base.id, set_number=1, reps=8, weight=50,
        is_completed=True, execution_version=2, base_execution_revision=0, client_operation_id=uuid4()))
    await workout_service.complete_workout(session, owner, workout.id, WorkoutCompleteRequest(execution_version=2))
    result = await get_exercise_progress(session, user_id=owner.id, exercise_id=base.id, date_from=day, date_to=day, include_compound=True)
    assert result["points"][0]["estimated_1rm"] == Decimal("63.3")
    assert (await load_hints_for_exercises(session, user_id=owner.id, exercise_ids=[base.id]))[0]["weight"] == 50
    assert base.id in await _history_by_exercise(session, user_id=owner.id, period_start=day, period_end=day)
    daily = (await session.execute(progress_dashboard._daily_set_statement(user_id=owner.id, start=day, end=day))).mappings().one()
    assert daily["completed_sets"] == 1 and daily["volume_kg"] == 400
    workouts = (await session.execute(progress_dashboard._daily_workout_statement(user_id=owner.id, start=day, end=day))).mappings().one()
    assert workouts["completed_workouts"] == 1


def test_parent_values_never_duplicate_parts_and_soft_deleted_facts_do_not_count():
    row = compound()
    row.reps, row.weight = 12, Decimal(100)
    assert normalized_set_volume(row) == 1200
    row.parts[1].is_deleted = True
    assert normalized_set_volume(row) == 800
    row.is_deleted = True
    assert normalized_set_volume(row) == 0
