"""Persist and apply exercise replacements prepared before workout start."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.user import User
from app.models.workout_plan_override import WorkoutPlanOverride
from app.schemas.workout import PlannedWorkoutReplacement


async def _find_override(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    program_id: uuid.UUID,
    scheduled_date: date,
    day_index: int,
) -> WorkoutPlanOverride | None:
    return await session.scalar(
        select(WorkoutPlanOverride).where(
            WorkoutPlanOverride.user_id == user_id,
            WorkoutPlanOverride.program_id == program_id,
            WorkoutPlanOverride.scheduled_date == scheduled_date,
            WorkoutPlanOverride.day_index == day_index,
            WorkoutPlanOverride.is_deleted.is_(False),
        )
    )


async def apply_saved_override(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    program_id: uuid.UUID,
    scheduled_date: date,
    day_index: int,
    base_plan: dict[str, Any],
    consume: bool = False,
) -> dict[str, Any]:
    override = await _find_override(
        session,
        user_id=user_id,
        program_id=program_id,
        scheduled_date=scheduled_date,
        day_index=day_index,
    )
    if override is None:
        return base_plan
    plan = await apply_replacements(session, base_plan, override.replacements)
    if consume:
        await session.delete(override)
    return plan


async def apply_replacements(
    session: AsyncSession,
    base_plan: dict[str, Any],
    replacements: list[dict[str, Any]],
) -> dict[str, Any]:
    exercises = [dict(item) for item in (base_plan.get("exercises") or [])]
    base_ids = {uuid.UUID(str(item["exercise_id"])) for item in exercises}
    mapping: dict[uuid.UUID, uuid.UUID] = {}
    for item in replacements:
        try:
            source = uuid.UUID(str(item["from_exercise_id"]))
            target = uuid.UUID(str(item["to_exercise_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Некорректная замена упражнения",
            ) from exc
        if source not in base_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Исходного упражнения нет в этом дне программы",
            )
        mapping[source] = target

    final_ids = [mapping.get(uuid.UUID(str(item["exercise_id"])), uuid.UUID(str(item["exercise_id"]))) for item in exercises]
    if len(final_ids) != len(set(final_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Одно упражнение нельзя добавить в план дважды",
        )

    target_ids = set(mapping.values())
    result = await session.scalars(
        select(Exercise).where(Exercise.id.in_(target_ids), Exercise.is_deleted.is_(False))
    ) if target_ids else None
    targets = {item.id: item for item in result.all()} if result is not None else {}
    if len(targets) != len(target_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Упражнение для замены не найдено")

    for item in exercises:
        source = uuid.UUID(str(item["exercise_id"]))
        target = mapping.get(source)
        if target is None or target == source:
            continue
        item["exercise_id"] = str(target)
        item["original_exercise_id"] = str(source)
        item["name_ru"] = targets[target].name_ru
        item.pop("suggested_weight", None)
    return {**base_plan, "exercises": exercises}


async def save_override(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    program_id: uuid.UUID,
    scheduled_date: date,
    day_index: int,
    week_phase: str | None,
    base_plan: dict[str, Any],
    replacements: list[PlannedWorkoutReplacement],
) -> dict[str, Any]:
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    payload = [
        {
            "from_exercise_id": str(item.from_exercise_id),
            "to_exercise_id": str(item.to_exercise_id),
        }
        for item in replacements
        if item.from_exercise_id != item.to_exercise_id
    ]
    plan = await apply_replacements(session, base_plan, payload)
    existing = await _find_override(
        session,
        user_id=user_id,
        program_id=program_id,
        scheduled_date=scheduled_date,
        day_index=day_index,
    )
    if not payload:
        if existing is not None:
            await session.delete(existing)
    elif existing is None:
        session.add(
            WorkoutPlanOverride(
                user_id=user_id,
                program_id=program_id,
                scheduled_date=scheduled_date,
                day_index=day_index,
                week_phase=week_phase,
                replacements=payload,
            )
        )
    else:
        existing.week_phase = week_phase
        existing.replacements = payload
    await session.commit()
    return plan

async def move_saved_overrides(
    session: AsyncSession, *, user_id: uuid.UUID, source_date: date, target_date: date,
    program_id: uuid.UUID | None = None,
) -> None:
    """Move legacy drafts inside the caller's locked-user transaction."""
    from sqlalchemy import update
    if source_date == target_date:
        return
    filters = [WorkoutPlanOverride.user_id == user_id, WorkoutPlanOverride.scheduled_date == source_date,
        WorkoutPlanOverride.is_deleted.is_(False)]
    targets = [WorkoutPlanOverride.user_id == user_id, WorkoutPlanOverride.scheduled_date == target_date]
    if program_id is not None:
        filters.append(WorkoutPlanOverride.program_id == program_id)
        targets.append(WorkoutPlanOverride.program_id == program_id)
    collisions = await session.scalars(select(WorkoutPlanOverride).where(*targets))
    removed = False
    for target in collisions.all():
        source = await session.scalar(select(WorkoutPlanOverride.id).where(*filters,
            WorkoutPlanOverride.program_id == target.program_id, WorkoutPlanOverride.day_index == target.day_index))
        if source is None:
            continue
        if not target.is_deleted:
            raise HTTPException(409, "На выбранную дату уже есть подготовленные замены")
        await session.delete(target)
        removed = True
    if removed:
        await session.flush()
    await session.execute(update(WorkoutPlanOverride).where(*filters).values(scheduled_date=target_date))
