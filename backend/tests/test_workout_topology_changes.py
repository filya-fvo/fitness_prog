from uuid import UUID

import pytest
from fastapi import HTTPException

from app.services import workout_topology
from app.schemas.workout import WorkoutPlan


def identity(value):
    return UUID(int=value)


GROUP = identity(1)
A = identity(10)
B = identity(11)
OTHER = identity(12)
REPLACEMENT = identity(13)
OPERATION = identity(200)


def step(step_id, exercise, ordinal, state, *, round_number=None, part=None, group=GROUP):
    return {
        "step_id": identity(step_id), "slot_id": exercise, "exercise_id": exercise,
        "set_number": ordinal, "round": round_number or ordinal, "group_id": group,
        "part_ordinal": part, "state": state,
    }


def change(rows, action, subject, *, target=None, count=None):
    return workout_topology.preview_active_topology_change(
        rows, operation_id=OPERATION, action=action, subject_id=subject,
        replacement_exercise_id=target, target_count=count,
    )


def test_member_replacement_does_not_relabel_the_recorded_half_of_a_drop_set():
    recorded = step(30, A, 1, "completed", part=1)
    skipped = step(31, A, 1, "skipped", part=2)
    unfinished = step(32, A, 1, "pending", part=3)
    partner = step(33, B, 1, "pending")
    later = step(34, A, 2, "pending")
    later_partner = step(35, B, 2, "pending")
    rows = [recorded, skipped, unfinished, partner, later, later_partner]

    result = change(rows, "replace_member", A, target=REPLACEMENT)

    assert result["steps"][0:2] == [recorded, skipped]
    assert result["steps"][3] == partner
    assert result["steps"][5] == later_partner
    assert result["removed_step_ids"] == [unfinished["step_id"], later["step_id"]]
    created = [result["steps"][2], result["steps"][4]]
    assert all(row["exercise_id"] == REPLACEMENT and row["part_ordinal"] is None for row in created)
    assert [(row["round"], row["group_id"]) for row in created] == [(1, GROUP), (2, GROUP)]
    assert result == change(rows, "replace_member", A, target=REPLACEMENT)


def test_whole_group_replacement_adds_one_set_per_remaining_round_in_order():
    unrelated = step(36, OTHER, 1, "pending", group=None)
    finished = step(30, A, 1, "completed")
    pending = [step(33, B, 1, "pending"), step(34, A, 2, "pending"), step(35, B, 2, "pending")]

    result = change([finished, *pending, unrelated], "replace_group", GROUP, target=REPLACEMENT)

    assert result["steps"][0] == finished and result["steps"][-1] == unrelated
    replacement = result["steps"][1:3]
    assert [(row["exercise_id"], row["group_id"], row["set_number"]) for row in replacement] == [
        (REPLACEMENT, None, 1), (REPLACEMENT, None, 2),
    ]
    assert result["removed_step_ids"] == [row["step_id"] for row in pending]


def test_resize_group_rejects_deleting_any_round_with_a_recorded_part():
    rows = [step(30, A, 1, "completed"), step(31, B, 1, "pending"),
            step(32, A, 2, "completed", part=1), step(33, A, 2, "pending", part=2),
            step(34, B, 2, "pending")]

    with pytest.raises(HTTPException) as caught:
        change(rows, "resize_group", GROUP, count=1)

    assert caught.value.status_code == 409


def test_resize_group_adds_round_in_member_order_before_the_following_exercise():
    original = [step(30, A, 1, "completed"), step(31, B, 1, "pending")]
    next_exercise = step(36, OTHER, 1, "pending", group=None)

    result = change([*original, next_exercise], "resize_group", GROUP, count=2)

    assert result["steps"][:2] == original and result["steps"][-1] == next_exercise
    assert [(row["exercise_id"], row["round"], row["state"]) for row in result["steps"][2:4]] == [
        (A, 2, "pending"), (B, 2, "pending"),
    ]


def test_resize_standalone_exercise_only_removes_pending_tail_sets():
    first = step(30, A, 1, "completed", group=None)
    second = step(31, A, 2, "pending", group=None)
    third = step(32, A, 3, "pending", part=1, group=None)
    fourth = step(33, A, 3, "pending", part=2, group=None)
    next_exercise = step(36, OTHER, 1, "pending", group=None)

    result = change([first, second, third, fourth, next_exercise], "resize_exercise", A, count=2)

    assert result["steps"] == [first, second, next_exercise]
    assert result["removed_step_ids"] == [third["step_id"], fourth["step_id"]]


def test_replacement_cannot_reuse_an_exercise_with_its_own_recorded_history():
    rows = [step(30, A, 1, "pending"), step(31, B, 1, "pending"),
            step(32, OTHER, 1, "completed", group=None)]

    with pytest.raises(HTTPException) as caught:
        change(rows, "replace_member", A, target=OTHER)

    assert caught.value.status_code == 409


def test_same_plan_revision_with_different_recorded_facts_invalidates_preview():
    pending = step(30, A, 1, "pending")
    old = workout_topology.active_topology_fingerprint(3, [pending])
    recorded = {**pending, "state": "completed"}

    assert old != workout_topology.active_topology_fingerprint(3, [recorded])
    assert old != workout_topology.active_topology_fingerprint(4, [pending])
    assert old == workout_topology.active_topology_fingerprint(3, [dict(reversed(list(pending.items())))])


def test_stale_devices_cannot_write_results_or_finish_after_topology_change():
    active_plan = {"execution_version": 2, "active_plan_revision": 1}
    for stale_revision in [None, 0, 2]:
        with pytest.raises(HTTPException) as caught:
            workout_topology.require_active_plan_revision(active_plan, stale_revision)
        assert caught.value.status_code == 409

    workout_topology.require_active_plan_revision(active_plan, 1)
    workout_topology.require_active_plan_revision({"execution_version": 2}, None)


def workout_plan():
    return WorkoutPlan.model_validate({
        "execution_version": 2,
        "groups": [{"id": GROUP, "kind": "superset", "exercise_ids": [A, B], "rounds": 2}],
        "exercises": [
            {"exercise_id": A, "order": 1, "target_sets": 2, "suggested_weight": 100},
            {"exercise_id": B, "order": 2, "target_sets": 2},
            {"exercise_id": OTHER, "order": 3, "target_sets": 1},
        ],
    })


def test_v2_projection_replaces_an_untouched_group_member_without_carrying_load():
    request = workout_topology.ActiveTopologyRequest(
        operation_id=OPERATION, action="replace_member", subject_id=A, replacement_exercise_id=REPLACEMENT,
    )
    rows = [step(30, A, 1, "pending"), step(31, B, 1, "completed"),
            step(32, A, 2, "pending"), step(33, B, 2, "pending")]
    projected = workout_topology.project_v2_topology(workout_plan(), rows, request, "Замена")

    assert projected.groups[0].exercise_ids == [REPLACEMENT, B]
    assert [(row.exercise_id, row.target_sets) for row in projected.exercises] == [(REPLACEMENT, 2), (B, 2), (OTHER, 1)]
    assert projected.exercises[0].suggested_weight is None


def test_v2_projection_turns_only_pending_group_rounds_into_replacement_sets():
    request = workout_topology.ActiveTopologyRequest(
        operation_id=OPERATION, action="replace_group", subject_id=GROUP, replacement_exercise_id=REPLACEMENT,
    )
    rows = [step(30, A, 1, "completed"), step(31, B, 1, "completed"),
            step(32, A, 2, "completed", part=1), step(33, A, 2, "pending", part=2), step(34, B, 2, "pending")]
    projected = workout_topology.project_v2_topology(workout_plan(), rows, request, "Замена")
    assert not projected.groups
    assert [(row.exercise_id, row.target_sets) for row in projected.exercises] == [(REPLACEMENT, 1), (OTHER, 1)]


def test_v2_projection_replaces_only_unfinished_rounds_of_a_group_member():
    request = workout_topology.ActiveTopologyRequest(
        operation_id=OPERATION, action="replace_member", subject_id=A, replacement_exercise_id=REPLACEMENT,
    )
    rows = [step(30, A, 1, "completed"), step(31, B, 1, "completed"),
            step(32, A, 2, "pending"), step(33, B, 2, "pending")]

    projected = workout_topology.project_v2_topology(workout_plan(), rows, request, "Замена")

    assert projected.groups[0].exercise_ids == [REPLACEMENT, B]
    assert projected.exercises[0].active_set_numbers == [2]
    assert projected.exercises[1].active_set_numbers is None
