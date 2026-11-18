"""Atomically preview and apply active edits that fit the structured V2 reader."""

from hashlib import sha256
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from app.models.exercise import Exercise
from app.models.workout import WorkoutSet
from app.models.workout_topology_receipt import WorkoutTopologyReceipt
from app.schemas.workout import WorkoutPlan, WorkoutResponse
from app.services import workout_execution
from app.services.workout_topology import (
    PLAN_CHANGED,
    ActiveTopologyApply,
    ActiveTopologyRequest,
    active_topology_fingerprint,
    project_v2_topology,
    require_active_plan_revision,
)


def _active_rows(workout, plan):
    groups = {exercise_id: group.id for group in plan.groups for exercise_id in group.exercise_ids}
    order = {row.exercise_id: row.order for row in plan.exercises}
    rows = []
    for parent in workout.sets:
        if parent.is_deleted or parent.exercise_id not in order:
            continue
        fields = dict(slot_id=parent.exercise_id, exercise_id=parent.exercise_id, set_number=parent.set_number,
                      round=parent.set_number, group_id=groups.get(parent.exercise_id))
        if parent.parts:
            rows.extend(dict(fields, step_id=part.id, part_ordinal=part.ordinal, state=part.status)
                        for part in parent.parts if not part.is_deleted)
        else:
            state = "completed" if parent.is_completed else "skipped" if parent.is_skipped else "pending"
            rows.append(dict(fields, step_id=parent.id, state=state))
    group_start = {group.id: min(order[exercise_id] for exercise_id in group.exercise_ids) for group in plan.groups}
    rows.sort(key=lambda row: (group_start.get(row["group_id"], order[row["exercise_id"]]), row["round"],
                               order[row["exercise_id"]], row.get("part_ordinal", 0)))
    return rows


async def _preview(session, workout, request):
    if workout.status != "planned" or (workout.plan or {}).get("execution_version") != 2:
        raise HTTPException(409, "Редактирование доступно во время сложной тренировки")
    revision = workout.plan.get("active_plan_revision", 0)
    if request.expected_plan_revision is not None:
        require_active_plan_revision(workout.plan, request.expected_plan_revision)
    plan = WorkoutPlan.model_validate(workout.plan)
    exercise = None
    if request.replacement_exercise_id:
        exercise = await session.scalar(select(Exercise).where(
            Exercise.id == request.replacement_exercise_id, Exercise.is_deleted.is_(False),
        ))
        if exercise is None:
            raise HTTPException(422, "Упражнение больше недоступно")
        if any(row.exercise_id == exercise.id and not row.is_deleted for row in workout.sets):
            raise HTTPException(409, "Это упражнение уже есть в плане или истории тренировки")
    rows = _active_rows(workout, plan)
    projected = project_v2_topology(plan, rows, request, exercise.name_ru if exercise else None)
    if projected == plan:
        raise HTTPException(422, "План уже содержит это число подходов")
    affected = {str(row.id): row.execution_revision for row in workout.sets if not row.is_deleted}
    stamp = active_topology_fingerprint(revision, [*rows, affected, request.model_dump(mode="json")])
    return projected, revision, stamp


async def preview_topology(session, user, workout_id: UUID, request: ActiveTopologyRequest) -> dict:
    workout = await workout_execution.lock_workout(session, workout_id, user.id)
    plan, revision, stamp = await _preview(session, workout, request)
    return {"plan": plan.model_dump(mode="json"), "plan_revision": revision, "preview_fingerprint": stamp}


def _align_slots(workout, projected: WorkoutPlan) -> None:
    slots = {(row.exercise_id, row.set_number): row for row in workout.sets}
    planned = {(row.exercise_id, number): row for row in projected.exercises for number in row.planned_set_numbers()}
    for key, row in slots.items():
        if key in planned or row.is_deleted:
            continue
        if row.is_completed or row.is_skipped or any(part.status != "pending" for part in row.parts):
            continue
        row.is_deleted = True
    for key, row in planned.items():
        previous = slots.get(key)
        if previous and not previous.is_deleted:
            continue
        if previous:
            if previous.is_completed or previous.is_skipped or any(part.status != "pending" for part in previous.parts):
                raise HTTPException(409, "Этот подход уже убирали из плана. Выберите другое число подходов")
            previous.parts.clear()
            previous.execution_kind = "standard"
            previous.reps = previous.weight = previous.duration_sec = None
            previous.weight_mode = row.weight_mode
            previous.note = row.note
            previous.machine_params = None
            previous.execution_revision += 1
            previous.is_deleted = False
            previous.rest_time_sec = row.rest_sec
            continue
        workout.sets.append(WorkoutSet(
            exercise_id=row.exercise_id, set_number=key[1], rest_time_sec=row.rest_sec,
            weight_mode=row.weight_mode, note=row.note,
        ))


async def apply_topology(session, user, workout_id: UUID, request: ActiveTopologyApply) -> WorkoutResponse:
    workout = await workout_execution.lock_workout(session, workout_id, user.id)
    digest = sha256(request.model_dump_json().encode()).hexdigest()
    receipt = await session.get(WorkoutTopologyReceipt, (workout_id, request.operation_id))
    if receipt:
        if receipt.request_hash != digest:
            raise HTTPException(409, "Это изменение уже сохранено с другими параметрами")
        return WorkoutResponse.model_validate(workout)
    projected, revision, stamp = await _preview(session, workout, ActiveTopologyRequest.model_validate(
        request.model_dump(exclude={"preview_fingerprint"}),
    ))
    if request.preview_fingerprint != stamp:
        raise HTTPException(409, PLAN_CHANGED)
    _align_slots(workout, projected)
    workout.plan = {**workout.plan, **projected.model_dump(mode="json"), "active_plan_revision": revision + 1}
    await session.flush()
    workout = await workout_execution.lock_workout(session, workout_id, user.id)
    response = WorkoutResponse.model_validate(workout)
    session.add(WorkoutTopologyReceipt(workout_id=workout_id, operation_id=request.operation_id, request_hash=digest))
    await session.commit()
    return response
