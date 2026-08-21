"""Legacy bulk shift operations kept for API compatibility."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.workout import Workout


async def shift_future_workouts(
    session: AsyncSession,
    user: User,
    *,
    from_date: date | None = None,
    days: int = 1,
) -> list[Workout]:
    """Shift every planned workout on or after a date by a fixed number of days."""
    if days == 0:
        return []
    if days < 0:
        raise HTTPException(status_code=400, detail="Количество дней не может быть отрицательным")
    start = from_date or date.today()
    result = await session.scalars(
        select(Workout)
        .options(selectinload(Workout.sets))
        .where(
            Workout.user_id == user.id,
            Workout.is_deleted.is_(False),
            Workout.status == "planned",
            Workout.scheduled_date >= start,
        )
        .order_by(Workout.scheduled_date.asc())
    )
    workouts = list(result.all())
    delta = timedelta(days=days)
    for workout in workouts:
        workout.scheduled_date = workout.scheduled_date + delta
    await session.commit()
    for workout in workouts:
        await session.refresh(workout)
    return workouts


async def mark_skipped_and_shift(
    session: AsyncSession,
    user: User,
    workout_id: uuid.UUID,
    *,
    shift_days: int = 1,
) -> Workout:
    """Mark one created workout skipped and shift later created sessions."""
    result = await session.execute(
        select(Workout)
        .options(selectinload(Workout.sets))
        .where(
            Workout.id == workout_id,
            Workout.user_id == user.id,
            Workout.is_deleted.is_(False),
        )
    )
    workout = result.scalar_one_or_none()
    if workout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")
    if workout.status == "completed":
        raise HTTPException(
            status_code=400,
            detail="Завершённую тренировку нельзя отметить пропущенной",
        )
    skip_date = workout.scheduled_date
    workout.status = "skipped"
    await session.flush()
    others = await session.scalars(
        select(Workout).where(
            Workout.user_id == user.id,
            Workout.is_deleted.is_(False),
            Workout.status == "planned",
            Workout.scheduled_date >= skip_date,
            Workout.id != workout.id,
        )
    )
    delta = timedelta(days=shift_days)
    for item in others.all():
        item.scheduled_date = item.scheduled_date + delta
    await session.commit()
    await session.refresh(workout)
    return workout
