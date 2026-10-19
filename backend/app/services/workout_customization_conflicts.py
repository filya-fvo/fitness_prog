"""Explicit conflict checks when a persistent day changes under date drafts."""
from hashlib import sha256

from fastapi import HTTPException
from sqlalchemy import select

from app.models.user_program_day_override import UserProgramDayOverride
from app.models.workout_plan_override import WorkoutPlanOverride
from app.schemas.workout_customization import WorkoutDayPatch
from app.services import planned_workout


async def validate_occurrences(session, user_id, program_id, day_index, base_plan, skip_date=None):
    from app.services.workout_customization import apply_day_patch
    condition = [UserProgramDayOverride.user_id == user_id, UserProgramDayOverride.program_id == program_id,
        UserProgramDayOverride.day_index == day_index, UserProgramDayOverride.scheduled_date.is_not(None),
        UserProgramDayOverride.is_deleted.is_(False)]
    if skip_date is not None:
        condition.append(UserProgramDayOverride.scheduled_date != skip_date)
    rows = await session.scalars(select(UserProgramDayOverride).where(*condition))
    for row in rows.all():
        try:
            await apply_day_patch(session, base_plan, WorkoutDayPatch.model_validate(row.patch))
        except HTTPException as exc:
            raise HTTPException(409, f"На {row.scheduled_date:%d.%m.%Y} есть разовая подготовка. Проверьте её перед изменением личного плана") from exc
    condition = [WorkoutPlanOverride.user_id == user_id, WorkoutPlanOverride.program_id == program_id,
        WorkoutPlanOverride.day_index == day_index, WorkoutPlanOverride.is_deleted.is_(False)]
    if skip_date is not None:
        condition.append(WorkoutPlanOverride.scheduled_date != skip_date)
    legacy = await session.scalars(select(WorkoutPlanOverride).where(*condition))
    for row in legacy.all():
        try:
            await planned_workout.apply_replacements(session, base_plan, row.replacements)
        except HTTPException as exc:
            raise HTTPException(409, f"На {row.scheduled_date:%d.%m.%Y} подготовлены замены. Проверьте их перед изменением личного плана") from exc


async def promote_occurrence(session, user_id, data):
    row = await session.scalar(select(UserProgramDayOverride).where(
        UserProgramDayOverride.user_id == user_id, UserProgramDayOverride.program_id == data.program_id,
        UserProgramDayOverride.day_index == data.day_index, UserProgramDayOverride.scheduled_date == data.promote_date,
    ).with_for_update().execution_options(populate_existing=True))
    if data.base_occurrence_revision != (row.revision if row else 0):
        raise HTTPException(409, "Разовая подготовка уже изменилась. Откройте её снова")
    if row is not None and not row.is_deleted:
        row.patch = {}
        row.is_deleted = True
        row.revision += 1
        row.last_operation_id = data.operation_id
        row.last_operation_hash = sha256(("promoted:" + data.model_dump_json()).encode()).hexdigest()
    legacy = await session.scalar(select(WorkoutPlanOverride).where(
        WorkoutPlanOverride.user_id == user_id, WorkoutPlanOverride.program_id == data.program_id,
        WorkoutPlanOverride.day_index == data.day_index, WorkoutPlanOverride.scheduled_date == data.promote_date,
    ))
    if legacy is not None:
        await session.delete(legacy)
