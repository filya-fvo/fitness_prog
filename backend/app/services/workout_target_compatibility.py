"""Restore an old client's omitted goal only from its authoritative snapshot."""

from app.schemas.workout import WorkoutPlan


def restore_omitted_targets(plan: WorkoutPlan, authoritative: dict) -> WorkoutPlan:
    # Inspect fields_set before model_dump materializes defaults. Explicit null is
    # a supplied value and must reach fingerprint/immutable validation unchanged.
    restored = plan.model_copy(deep=True)
    expected = WorkoutPlan.model_validate(authoritative)
    targets = {(row.exercise_id, row.order): row.target for row in expected.exercises}
    for row in restored.exercises:
        target = targets.get((row.exercise_id, row.order))
        if "target" not in row.model_fields_set and target is not None:
            row.target = target.model_copy(deep=True)
    return restored
