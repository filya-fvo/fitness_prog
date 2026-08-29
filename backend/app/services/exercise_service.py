"""Exercise catalog business logic."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate
from app.services import admin_audit


class ExerciseInUseError(RuntimeError):
    def __init__(self, workout_uses: int, program_uses: int) -> None:
        super().__init__("Exercise is used by workouts or programs")
        self.workout_uses = workout_uses
        self.program_uses = program_uses


class ExerciseRestoreConflictError(RuntimeError):
    """An active exercise already has the same normalized name."""


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


async def get_archived_exercise(session: AsyncSession, exercise_id: uuid.UUID) -> Exercise | None:
    result = await session.execute(
        select(Exercise).where(Exercise.id == exercise_id, Exercise.is_deleted.is_(True))
    )
    return result.scalar_one_or_none()


async def create_exercise(
    session: AsyncSession,
    data: ExerciseCreate,
    *,
    audit_context: admin_audit.AuditContext | None = None,
) -> Exercise:
    exercise = Exercise(**data.model_dump())
    session.add(exercise)
    await session.flush()
    if audit_context is not None:
        admin_audit.add_event(
            session,
            context=audit_context,
            action="exercise.create",
            object_type="exercise",
            object_id=exercise.id,
            result="success",
            description="Упражнение добавлено в каталог.",
            after=admin_audit.exercise_snapshot(exercise),
        )
    await session.commit()
    await session.refresh(exercise)
    return exercise


async def update_exercise(
    session: AsyncSession,
    exercise: Exercise,
    data: ExerciseUpdate,
    *,
    audit_context: admin_audit.AuditContext | None = None,
) -> Exercise:
    before = admin_audit.exercise_snapshot(exercise)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(exercise, key, value)
    if audit_context is not None:
        admin_audit.add_event(
            session,
            context=audit_context,
            action="exercise.update",
            object_type="exercise",
            object_id=exercise.id,
            result="success",
            description="Упражнение изменено.",
            before=before,
            after=admin_audit.exercise_snapshot(exercise),
        )
    await session.commit()
    await session.refresh(exercise)
    return exercise


async def soft_delete_exercise(
    session: AsyncSession,
    exercise: Exercise,
    *,
    audit_context: admin_audit.AuditContext | None = None,
) -> None:
    # Imported lazily to keep regular catalog reads independent from admin helpers.
    from app.services import admin_exercises

    workout_uses, program_uses = await admin_exercises.usage_counts(session, exercise.id)
    if workout_uses or program_uses:
        raise ExerciseInUseError(workout_uses, program_uses)
    before = admin_audit.exercise_snapshot(exercise)
    exercise.is_deleted = True
    if audit_context is not None:
        admin_audit.add_event(
            session,
            context=audit_context,
            action="exercise.archive",
            object_type="exercise",
            object_id=exercise.id,
            result="success",
            description="Упражнение перемещено в архив.",
            before=before,
            after=admin_audit.exercise_snapshot(exercise),
        )
    await session.commit()


async def restore_exercise(
    session: AsyncSession,
    exercise: Exercise,
    *,
    audit_context: admin_audit.AuditContext | None = None,
) -> Exercise:
    from app.services import admin_exercises

    duplicates = await admin_exercises.find_duplicates(session, exercise.name_ru)
    if any(item.similarity == 1 for item in duplicates):
        raise ExerciseRestoreConflictError("Active exercise with this name already exists")
    before = admin_audit.exercise_snapshot(exercise)
    exercise.is_deleted = False
    if audit_context is not None:
        admin_audit.add_event(
            session,
            context=audit_context,
            action="exercise.restore",
            object_type="exercise",
            object_id=exercise.id,
            result="success",
            description="Упражнение восстановлено из архива.",
            before=before,
            after=admin_audit.exercise_snapshot(exercise),
        )
    await session.commit()
    await session.refresh(exercise)
    return exercise
