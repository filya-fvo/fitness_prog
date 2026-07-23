"""Exercise catalog business logic."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate


async def list_exercises(
    session: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    muscle_group: str | None = None,
    equipment: str | None = None,
    q: str | None = None,
    tag: str | None = None,
) -> tuple[list[Exercise], int]:
    filters = [Exercise.is_deleted.is_(False)]
    if muscle_group:
        filters.append(Exercise.muscle_group == muscle_group)
    if equipment:
        filters.append(Exercise.equipment == equipment)
    if q:
        like = f"%{q.strip()}%"
        filters.append(
            or_(
                Exercise.name_ru.ilike(like),
                Exercise.description.ilike(like),
                Exercise.technique.ilike(like),
            )
        )
    if tag:
        filters.append(Exercise.tags.contains([tag]))

    total = await session.scalar(select(func.count()).select_from(Exercise).where(*filters))
    result = await session.execute(
        select(Exercise)
        .where(*filters)
        .order_by(Exercise.name_ru.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.scalars().all()), int(total or 0)


async def get_exercise(session: AsyncSession, exercise_id: uuid.UUID) -> Exercise | None:
    result = await session.execute(
        select(Exercise).where(Exercise.id == exercise_id, Exercise.is_deleted.is_(False))
    )
    return result.scalar_one_or_none()


async def create_exercise(session: AsyncSession, data: ExerciseCreate) -> Exercise:
    exercise = Exercise(**data.model_dump())
    session.add(exercise)
    await session.commit()
    await session.refresh(exercise)
    return exercise


async def update_exercise(
    session: AsyncSession,
    exercise: Exercise,
    data: ExerciseUpdate,
) -> Exercise:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(exercise, key, value)
    await session.commit()
    await session.refresh(exercise)
    return exercise


async def soft_delete_exercise(session: AsyncSession, exercise: Exercise) -> None:
    exercise.is_deleted = True
    await session.commit()
