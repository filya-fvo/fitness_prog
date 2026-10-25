"""Compatibility pins captured before adding the optional explicit target."""
from datetime import date
from types import SimpleNamespace


import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.workout import WorkoutPlan, WorkoutPlanExercise
from app.services.workout_execution import validate_plan_edit
from app.services.workout_preparation import plan_fingerprint


def legacy_plan():
    return {"execution_version": 2, "day_index": 1, "week_phase": "medium", "exercises": [
        {"exercise_id": "00000000-0000-4000-8000-000000000003", "order": 1,
         "target_sets": 3, "target_reps": "8-12", "rest_sec": 60}]}


def fingerprint(plan):
    return plan_fingerprint(
        SimpleNamespace(id="00000000-0000-4000-8000-000000000001"),
        SimpleNamespace(id="00000000-0000-4000-8000-000000000002", version=7), plan,
        scheduled_date=date(2026, 10, 25), day_index=1, week_phase="medium", cycle_readiness=None,
    )


def test_pre_target_fingerprint_pin():
    assert fingerprint(legacy_plan()) == "9d07cceb216f48d73c2349e5ea80ba26b2b9f7721523afd3678d2c3c26a5266d"



VALID_TARGETS = [
    {"kind": "reps_only", "reps_min": 1, "reps_max": 100000},
    {"kind": "weight_reps", "reps_min": 8, "reps_max": 12, "target_weight": "40.00"},
    {"kind": "weight_reps", "reps_min": 8, "reps_max": 8, "target_weight": None},
    {"kind": "weight_reps", "reps_min": 8, "reps_max": 8, "target_weight": "0.01"},
    {"kind": "weight_reps", "reps_min": 8, "reps_max": 8, "target_weight": 10000},
    {"kind": "timed", "duration_sec": 86400},
]


@pytest.mark.parametrize("target", VALID_TARGETS)
def test_explicit_target_survives_json_roundtrip(target):
    raw = legacy_plan()
    raw["exercises"][0]["target"] = target
    parsed = WorkoutPlan.model_validate(raw)
    row = parsed.model_dump(mode="json")["exercises"][0]
    assert row.get("target") is not None
    assert row["target"]["kind"] == target["kind"]
    assert row["target_reps"] == "8-12"
    assert row["suggested_weight"] is None
    assert WorkoutPlan.model_validate_json(parsed.model_dump_json()) == parsed
    if target.get("target_weight") == "40.00":
        assert row["target"]["target_weight"] == "40.00"


INVALID_TARGETS = [
    {"kind": "unknown"}, {"kind": "rest_pause"}, {},
    {"kind": "timed", "duration_sec": 1, "reps_min": 1},
    {"kind": "reps_only", "reps_min": 2, "reps_max": 1},
    {"kind": "reps_only", "reps_min": 1, "reps_max": 2, "target_weight": None},
    {"kind": "weight_reps", "reps_min": 1, "reps_max": 2},
] + [{"kind": "timed", "duration_sec": value} for value in [0, -1, 86401, 1.5, True, "1", float("nan"), float("inf")]] + [
    {"kind": "reps_only", "reps_min": value, "reps_max": 100000}
    for value in [0, -1, 100001, 1.5, True, "1", float("nan"), float("inf")]
] + [
    {"kind": "reps_only", "reps_min": 1, "reps_max": value}
    for value in [0, 100001, 1.5, True, "1", float("nan"), float("inf")]
] + [
    {"kind": "weight_reps", "reps_min": 1, "reps_max": 2, "target_weight": value}
    for value in [0, -1, 10000.01, "1.001", 1.001, True, "", float("nan"), float("inf"), "NaN", "Infinity"]
]


@pytest.mark.parametrize("target", INVALID_TARGETS)
def test_rejects_invalid_explicit_target(target):
    with pytest.raises(ValidationError):
        WorkoutPlanExercise.model_validate({**legacy_plan()["exercises"][0], "target": target})


def test_absent_and_null_target_keep_legacy_fingerprint():
    raw = legacy_plan()
    raw["exercises"][0]["target"] = None
    assert fingerprint(raw) == "9d07cceb216f48d73c2349e5ea80ba26b2b9f7721523afd3678d2c3c26a5266d"
    assert WorkoutPlan.model_validate(legacy_plan()).exercises[0].target is None


@pytest.mark.parametrize("target", VALID_TARGETS)
def test_present_target_changes_fingerprint_and_cannot_edit_active_v2(target):
    old = legacy_plan()
    new = legacy_plan()
    new["exercises"][0]["target"] = target
    assert fingerprint(old) != fingerprint(new)
    with pytest.raises(HTTPException) as caught:
        validate_plan_edit(old, new)
    assert caught.value.status_code == 409
    with pytest.raises(HTTPException) as caught:
        validate_plan_edit(new, old)
    assert caught.value.status_code == 409


def test_distinct_targets_change_fingerprint_and_edit_is_rejected():
    a, b = legacy_plan(), legacy_plan()
    a["exercises"][0]["target"] = {"kind": "timed", "duration_sec": 30}
    b["exercises"][0]["target"] = {"kind": "timed", "duration_sec": 31}
    assert fingerprint(a) != fingerprint(b)
    with pytest.raises(HTTPException) as caught:
        validate_plan_edit(a, b)
    assert caught.value.status_code == 409


def test_equivalent_weights_and_null_legacy_target_are_semantic():
    a, b = legacy_plan(), legacy_plan()
    b["exercises"][0]["target"] = None
    validate_plan_edit(a, b)
    target = {"kind": "weight_reps", "reps_min": 8, "reps_max": 12, "target_weight": "40.00"}
    a["exercises"][0]["target"] = target
    b["exercises"][0]["target"] = {**target, "target_weight": 40}
    assert fingerprint(a) == fingerprint(b)
    validate_plan_edit(a, b)
