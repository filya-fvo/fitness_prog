"""Validate a prepared program snapshot, then reuse canonical start construction."""

from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.workout import Workout
from app.schemas.workout import WorkoutCreate, WorkoutPlan
from app.services import program_service, workout_service
from app.services.offline_schedule import schedule_fingerprint


class PreparationStamp(BaseModel):
    offline_prepared_at: datetime
    offline_schedule_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")


async def canonical_prepared_start(
    session: AsyncSession, user: User, payload: WorkoutCreate, body: dict
) -> WorkoutCreate:
    stamp = PreparationStamp.model_validate(body)
    if (
        not payload.program_id
        or not payload.day_index
        or not payload.plan
        or not payload.plan.exercises
    ):
        raise HTTPException(422, "Не удалось проверить сохранённый план программы")
    existing = await session.scalar(
        select(Workout).where(
            Workout.user_id == user.id,
            Workout.program_id == payload.program_id,
            Workout.scheduled_date == payload.scheduled_date,
            Workout.is_deleted.is_(False),
        )
    )
    if existing is not None:
        if existing.client_workout_id == payload.client_workout_id:
            return payload
        raise HTTPException(
            422, "Тренировка на эту дату уже есть на сервере. Проверьте сохранённую запись"
        )
    if stamp.offline_schedule_fingerprint != schedule_fingerprint(user.goals or {}):
        raise HTTPException(422, "Расписание изменилось после подготовки. Результат сохранён на устройстве; проверьте дату тренировки.")
    program = await program_service.get_program(
        session,
        payload.program_id,
        active_program_id=(user.goals or {}).get("active_program_id"),
        user_id=user.id,
    )
    if program is None:
        raise HTTPException(404, "Программа не найдена")
    expected = await workout_service.build_program_plan_for_user(
        session,
        user,
        program,
        day_index=payload.day_index,
        scheduled_date=payload.scheduled_date,
        week_phase=payload.week_phase,
        cycle_readiness=payload.cycle_readiness,
        consume_saved_override=False,
    )
    if WorkoutPlan.model_validate(expected) != payload.plan:
        raise HTTPException(
            422, "План программы изменился после подготовки. Проверьте сохранённую запись"
        )
    # create_workout builds this exact plan again and consumes the matching
    # saved replacement inside the same sync unit of work.
    return payload.model_copy(update={"plan": None})
