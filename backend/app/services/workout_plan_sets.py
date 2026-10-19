"""Keep recorded set identities stable when a workout plan is edited."""
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workout import Workout


async def align_replacement_slots(session: AsyncSession, workout: Workout, plan: dict) -> None:
    old_rows = (workout.plan or {}).get("exercises", [])
    old_ids = {UUID(str(row["exercise_id"])) for row in old_rows}
    new_ids = {UUID(str(row["exercise_id"])) for row in plan["exercises"]}
    mapping: dict[UUID, UUID] = {}
    for row in plan["exercises"]:
        target = UUID(str(row["exercise_id"]))
        if target in old_ids:
            # Reordering an existing exercise never changes the set's identity.
            continue
        original = row.get("original_exercise_id")
        candidates = [old for old in old_rows if (
            (original and str(old["exercise_id"]) == str(original))
            or (original and str(old.get("original_exercise_id")) == str(original))
            or str(old.get("original_exercise_id")) == str(target)
        ) and UUID(str(old["exercise_id"])) not in new_ids]
        if len(candidates) == 1:
            mapping[UUID(str(candidates[0]["exercise_id"]))] = target
    slots = {(row.exercise_id, row.set_number): row for row in workout.sets}
    for row in workout.sets:
        target = mapping.get(row.exercise_id)
        if target is None or row.is_completed:
            continue
        collision = slots.get((target, row.set_number))
        if collision is not None:
            # Preserve facts rather than discard a saved set to resolve a collision.
            continue
        slots.pop((row.exercise_id, row.set_number), None)
        row.exercise_id = target
        slots[(target, row.set_number)] = row
