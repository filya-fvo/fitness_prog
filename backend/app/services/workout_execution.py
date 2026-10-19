"""Atomic structured-set writes shared by REST and native sync dispatch."""
from hashlib import sha256

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.workout import Workout
from app.models.workout_set_part import WorkoutSetExecutionReceipt, WorkoutSetPart
from app.schemas.workout import WorkoutPlan, WorkoutSetResponse
from app.schemas.workout_execution import validate_weights


UPDATE_REQUIRED = "Для этой тренировки обновите приложение. Результат сохранён на устройстве"


def require_execution_version(plan, version):
    if (plan or {}).get("execution_version") == 2 and version != 2:
        raise HTTPException(409, UPDATE_REQUIRED)


async def lock_workout(session, workout_id, user_id):
    workout = await session.scalar(select(Workout).where(
        Workout.id == workout_id, Workout.user_id == user_id, Workout.is_deleted.is_(False),
    ).with_for_update().options(selectinload(Workout.sets)).execution_options(populate_existing=True))
    if workout is None:
        raise HTTPException(404, "Тренировка не найдена")
    return workout


def seed_method_parts(parent, method):
    parent.execution_kind = method["kind"]
    parent.parts = [WorkoutSetPart(
        ordinal=index, status="pending", rest_after_sec=part.get("pause_after_sec", 0),
    ) for index, part in enumerate(method["parts"], 1)]


async def save_execution_set(session, user, workout_id, data):
    workout = await lock_workout(session, workout_id, user.id)
    require_execution_version(workout.plan, data.execution_version)
    if data.execution_version != 2 or data.base_execution_revision is None or data.client_operation_id is None:
        raise HTTPException(409, UPDATE_REQUIRED)
    try:
        plan = WorkoutPlan.model_validate(workout.plan)
    except ValidationError as exc:
        raise HTTPException(409, "Не удалось проверить план тренировки. Результат сохранён на устройстве") from exc
    exercise = next((row for row in plan.exercises if row.exercise_id == data.exercise_id), None)
    if exercise is None or data.set_number > exercise.target_sets:
        raise HTTPException(422, "Подход отсутствует в плане тренировки")
    method = next((row for row in exercise.set_methods if row.set_number == data.set_number), None)
    kind = method.kind if method else "standard"
    if data.execution_kind != kind or (kind == "standard" and data.parts):
        raise HTTPException(422, "Вид подхода не соответствует плану тренировки")
    parent = next((row for row in workout.sets if row.exercise_id == data.exercise_id and row.set_number == data.set_number and not row.is_deleted), None)
    if parent is None:
        raise HTTPException(409, "Подход не найден. Обновите сохранённую тренировку")
    digest = sha256(data.model_dump_json().encode()).hexdigest()
    receipt = await session.get(WorkoutSetExecutionReceipt, (parent.id, data.client_operation_id))
    if receipt is not None:
        if receipt.request_hash != digest:
            raise HTTPException(409, "Эта операция уже сохранена с другим результатом")
        return WorkoutSetResponse.model_validate(receipt.response)
    if parent.execution_revision != data.base_execution_revision:
        raise HTTPException(409, "Подход уже изменён на другом устройстве. Ваш результат сохранён локально")
    if method:
        if len(data.parts) != len(method.parts) or [part.ordinal for part in data.parts] != list(range(1, len(method.parts) + 1)):
            raise HTTPException(422, "Передайте все части подхода в заданном порядке")
        if len({part.id for part in data.parts}) != len(data.parts):
            raise HTTPException(422, "Идентификаторы частей не должны повторяться")
        try:
            validate_weights(kind, [part.weight for part in data.parts])
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        old_by_id = {part.id: part for part in parent.parts}
        changed_ids = set(old_by_id) != {part.id for part in data.parts}
        if changed_ids and (parent.execution_revision > 0 or any(part.status != "pending" for part in parent.parts)):
            raise HTTPException(409, "Состав частей уже сохранён. Проверьте результат на устройстве")
        if any(part.id in old_by_id and old_by_id[part.id].ordinal != part.ordinal for part in data.parts):
            raise HTTPException(422, "Нельзя менять порядок сохранённых частей")
        if changed_ids:
            collisions = await session.scalars(select(WorkoutSetPart.id).where(WorkoutSetPart.id.in_([part.id for part in data.parts])))
            if any(identity not in old_by_id for identity in collisions.all()):
                raise HTTPException(409, "Идентификатор части уже используется")
            parent.parts.clear()
            await session.flush()
            parent.parts = [WorkoutSetPart(id=part.id, ordinal=part.ordinal) for part in data.parts]
        for part, incoming in zip(parent.parts, data.parts):
            for key in ("reps", "weight", "duration_sec", "status", "rest_after_sec"):
                setattr(part, key, getattr(incoming, key))
        parent.reps = parent.weight = None
        parent.is_completed = not any(part.status == "pending" for part in data.parts) and any(part.status == "completed" for part in data.parts)
    else:
        parent.reps, parent.weight, parent.is_completed = data.reps, data.weight, data.is_completed
    for key in ("weight_mode", "rest_time_sec", "duration_sec", "note", "machine_params"):
        setattr(parent, key, getattr(data, key))
    parent.execution_kind = kind
    parent.execution_revision += 1
    await session.flush()
    await session.refresh(parent)
    response = WorkoutSetResponse.model_validate(parent)
    session.add(WorkoutSetExecutionReceipt(workout_set_id=parent.id, operation_id=data.client_operation_id,
        request_hash=digest, response=response.model_dump(mode="json")))
    await session.commit()
    return response


def validate_plan_edit(old_plan, new_plan):
    require_execution_version(old_plan, new_plan.get("execution_version"))
    if old_plan.get("execution_version") == 2 or new_plan.get("execution_version") == 2:
        # The execution topology is a session snapshot. Future-day editing remains separate.
        def topology(plan):
            return (plan.get("groups") or [], [(row["exercise_id"], row.get("target_sets", 3), row.get("set_methods") or []) for row in plan.get("exercises", [])])
        if topology(old_plan) != topology(new_plan):
            raise HTTPException(409, "Состав сложной тренировки меняется при подготовке следующей, до её начала")
