"""Resolve private workout deltas without mutating the shared program."""
from copy import deepcopy
from datetime import date
from hashlib import sha256
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.models.user_program_day_override import UserProgramDayOverride
from app.schemas.workout_customization import (
    WorkoutCustomizationContext, WorkoutCustomizationRequest, WorkoutCustomizationResponse, WorkoutDayPatch,
)
from app.services import program_service


def _slot(context: WorkoutCustomizationContext):
    return (
        UserProgramDayOverride.program_id == context.program_id,
        UserProgramDayOverride.day_index == context.day_index,
        UserProgramDayOverride.scheduled_date == context.scheduled_date,
    )


async def _program(session: AsyncSession, user: User, program_id: UUID) -> Program:
    program = await program_service.get_program(
        session, program_id, active_program_id=(user.goals or {}).get("active_program_id"), user_id=user.id,
    )
    if program is None:
        raise HTTPException(404, "Программа не найдена")
    return program


def _response(program: Program, context: WorkoutCustomizationContext, row=None):
    return WorkoutCustomizationResponse(
        **context.model_dump(), revision=row.revision if row else 0,
        program_version=program.version,
        patch=WorkoutDayPatch.model_validate(row.patch) if row and not row.is_deleted else WorkoutDayPatch(),
    )


async def get_customization(session: AsyncSession, user: User, **kwargs) -> WorkoutCustomizationResponse:
    context = WorkoutCustomizationContext(**kwargs)
    program = await _program(session, user, context.program_id)
    row = await session.scalar(select(UserProgramDayOverride).where(
        UserProgramDayOverride.user_id == user.id, *_slot(context),
    ))
    if row and row.program_version != program.version:
        raise HTTPException(409, "Версия программы изменилась. Проверьте личные изменения")
    return _response(program, context, row)


async def apply_day_patch(session: AsyncSession, base_plan: dict, patch: WorkoutDayPatch) -> dict:
    from app.services.workout_service import phase_meta_from_name

    plan = deepcopy(base_plan)
    exercises = plan.get("exercises", [])
    by_id = {UUID(str(item["exercise_id"])): item for item in exercises}
    removed = set(patch.removed_exercise_ids)
    if not removed.issubset(by_id):
        raise HTTPException(409, "Состав дня изменился. Проверьте удалённые упражнения")
    exercises = [item for item in exercises if UUID(str(item["exercise_id"])) not in removed]
    by_id = {UUID(str(item["exercise_id"])): item for item in exercises}
    needed = {item.exercise_id for item in patch.added_exercises}
    needed.update(item.replacement_exercise_id for item in patch.exercise_overrides if item.replacement_exercise_id)
    catalog = {}
    if needed:
        rows = await session.scalars(select(Exercise).where(Exercise.id.in_(needed), Exercise.is_deleted.is_(False)))
        catalog = {row.id: row for row in rows.all()}
        if set(catalog) != needed:
            raise HTTPException(422, "Одно из упражнений больше недоступно. Выберите другое")
    phase = str(plan.get("week_phase") or "medium")
    targets = phase_meta_from_name(phase if phase in {"light", "medium", "heavy"} else "medium")
    for added in patch.added_exercises:
        if added.exercise_id in by_id:
            raise HTTPException(422, "Упражнение уже есть в этом дне")
        item = added.model_dump(mode="json", exclude_none=True)
        item["target_reps"] = added.target_reps or targets["target_reps"]
        item["rest_sec"] = added.rest_sec if added.rest_sec is not None else (90 if phase == "heavy" else 60)
        item["name_ru"] = catalog[added.exercise_id].name_ru
        exercises.append(item)
        by_id[added.exercise_id] = item
    for override in patch.exercise_overrides:
        item = by_id.get(override.exercise_id)
        if item is None:
            raise HTTPException(409, "Упражнение для изменения отсутствует в этом дне")
        values = override.model_dump(mode="json", exclude_none=True, exclude={"exercise_id", "replacement_exercise_id"})
        item.update(values)
        if override.replacement_exercise_id and override.replacement_exercise_id != override.exercise_id:
            target = override.replacement_exercise_id
            if target in by_id:
                raise HTTPException(422, "Упражнение уже есть в этом дне")
            by_id.pop(override.exercise_id)
            by_id[target] = item
            item.update(exercise_id=str(target), original_exercise_id=str(override.exercise_id), name_ru=catalog[target].name_ru)
            item.pop("suggested_weight", None)
    if not 1 <= len(exercises) <= 20:
        raise HTTPException(422, "В дне должно быть от 1 до 20 упражнений")
    if patch.exercise_order is not None:
        if set(patch.exercise_order) != set(by_id):
            raise HTTPException(409, "Порядок не соответствует составу дня. Обновите план")
        exercises = [by_id[exercise_id] for exercise_id in patch.exercise_order]
    for order, item in enumerate(exercises, 1):
        item["order"] = order
    if patch.groups:
        # Enabled together with the validated execution-v2 contract in W4.
        raise HTTPException(422, "Настройка связок пока недоступна")
    if patch.groups == []:
        plan.pop("groups", None)
    plan["exercises"] = exercises
    return plan


async def apply_customizations(
    session: AsyncSession, *, user_id: UUID, program_id: UUID, day_index: int,
    scheduled_date: date, base_plan: dict, scopes: tuple[str, ...] = ("program_day", "occurrence"),
) -> dict:
    rows = await session.scalars(select(UserProgramDayOverride).where(
        UserProgramDayOverride.user_id == user_id,
        UserProgramDayOverride.program_id == program_id,
        UserProgramDayOverride.day_index == day_index,
        or_(UserProgramDayOverride.scheduled_date.is_(None), UserProgramDayOverride.scheduled_date == scheduled_date),
    ))
    plan = base_plan
    for row in sorted(rows.all(), key=lambda item: item.scheduled_date is not None):
        scope = "occurrence" if row.scheduled_date else "program_day"
        if scope not in scopes:
            continue
        if not row.is_deleted:
            plan = await apply_day_patch(session, plan, WorkoutDayPatch.model_validate(row.patch))
        plan = {**plan, "customization_revisions": {**plan.get("customization_revisions", {}), scope: row.revision}}
    return plan


async def _write(session: AsyncSession, user: User, data: WorkoutCustomizationRequest, *, reset: bool):
    from app.services import workout_service

    program = await _program(session, user, data.program_id)
    context = WorkoutCustomizationContext(**data.model_dump(include=set(WorkoutCustomizationContext.model_fields)))
    key = f"workout-customization:{user.id}:{data.program_id}:{data.day_index}:{data.scheduled_date}"
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": key})
    row = await session.scalar(select(UserProgramDayOverride).where(
        UserProgramDayOverride.user_id == user.id, *_slot(context),
    ).with_for_update().execution_options(populate_existing=True))
    operation_hash = sha256((str(reset) + data.model_dump_json()).encode()).hexdigest()
    if row and row.last_operation_id == data.operation_id:
        if row.last_operation_hash != operation_hash:
            raise HTTPException(409, "Повторное действие содержит другие изменения")
        return _response(program, context, row)
    if data.base_revision != (row.revision if row else 0):
        raise HTTPException(409, "План уже изменён на другом устройстве. Обновите его перед сохранением")
    if row and row.program_version != program.version:
        raise HTTPException(409, "Версия программы изменилась. Проверьте личные изменения")
    if not reset:
        base = await workout_service.build_plan_from_program_day(session, program, data.day_index)
        if data.scope == "occurrence":
            base = await apply_customizations(session, user_id=user.id, program_id=program.id,
                day_index=data.day_index, scheduled_date=data.scheduled_date, base_plan=base, scopes=("program_day",))
        await apply_day_patch(session, base, data.patch)
    if data.scope == "occurrence":
        from app.models.workout_plan_override import WorkoutPlanOverride
        legacy = await session.scalar(select(WorkoutPlanOverride).where(
            WorkoutPlanOverride.user_id == user.id, WorkoutPlanOverride.program_id == program.id,
            WorkoutPlanOverride.day_index == data.day_index,
            WorkoutPlanOverride.scheduled_date == data.scheduled_date,
        ))
        if legacy is not None:
            await session.delete(legacy)
    if row is None:
        row = UserProgramDayOverride(user_id=user.id, program_id=program.id, day_index=data.day_index,
            scheduled_date=data.scheduled_date, revision=0, program_version=program.version)
        session.add(row)
    row.patch = {} if reset else data.patch.model_dump(mode="json")
    row.is_deleted = reset
    row.revision += 1
    row.last_operation_id = data.operation_id
    row.last_operation_hash = operation_hash
    await session.commit()
    return _response(program, context, row)


async def save_customization(session: AsyncSession, user: User, data: WorkoutCustomizationRequest):
    return await _write(session, user, data, reset=False)


async def reset_customization(session: AsyncSession, user: User, data: WorkoutCustomizationRequest):
    return await _write(session, user, data, reset=True)
