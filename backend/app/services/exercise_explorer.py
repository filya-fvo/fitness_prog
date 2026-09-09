"""Bounded exercise explorer queries and cross-device user pins."""

from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.user import User
from app.models.user_exercise_pin import UserExercisePin
from app.models.workout import Workout, WorkoutSet

ExplorerScope = Literal["all", "recent", "pinned"]
PIN_LIMIT = 8


class ExercisePinLimitError(RuntimeError):
    """The user already has the maximum number of pinned exercises."""


class ExerciseUnavailableError(RuntimeError):
    """The requested exercise does not exist in the active catalog."""


def _recent_subquery(user_id: uuid.UUID):
    return (
        select(
            WorkoutSet.exercise_id.label("exercise_id"),
            func.max(Workout.scheduled_date).label("last_completed_date"),
            func.count(func.distinct(Workout.id)).label("completed_workouts"),
        )
        .join(Workout, Workout.id == WorkoutSet.workout_id)
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            WorkoutSet.is_completed.is_(True),
            WorkoutSet.is_deleted.is_(False),
        )
        .group_by(WorkoutSet.exercise_id)
        .subquery("recent_user_exercises")
    )


def _pins_subquery(user_id: uuid.UUID):
    return (
        select(
            UserExercisePin.exercise_id.label("exercise_id"),
            UserExercisePin.created_at.label("pinned_at"),
        )
        .where(UserExercisePin.user_id == user_id)
        .subquery("current_user_exercise_pins")
    )


async def list_explorer(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    page: int,
    page_size: int,
    scope: ExplorerScope,
    muscle_group: str | None = None,
    q: str | None = None,
) -> dict[str, object]:
    """Return one bounded catalog page annotated with recent and pinned state."""

    recent = _recent_subquery(user_id)
    pins = _pins_subquery(user_id)
    filters = [Exercise.is_deleted.is_(False)]
    if scope == "recent":
        filters.append(recent.c.last_completed_date.is_not(None))
    elif scope == "pinned":
        filters.append(pins.c.pinned_at.is_not(None))
    if muscle_group:
        filters.append(Exercise.muscle_group == muscle_group)
    cleaned_query = (q or "").strip()
    if cleaned_query:
        like = f"%{cleaned_query}%"
        filters.append(
            or_(
                Exercise.name_ru.ilike(like),
                Exercise.description.ilike(like),
            )
        )

    joined = (
        select(
            Exercise,
            pins.c.pinned_at,
            recent.c.last_completed_date,
            recent.c.completed_workouts,
        )
        .outerjoin(pins, pins.c.exercise_id == Exercise.id)
        .outerjoin(recent, recent.c.exercise_id == Exercise.id)
        .where(*filters)
    )
    if scope == "pinned":
        joined = joined.order_by(pins.c.pinned_at.asc(), Exercise.name_ru.asc())
    elif scope == "recent":
        joined = joined.order_by(
            recent.c.last_completed_date.desc(),
            Exercise.name_ru.asc(),
        )
    else:
        joined = joined.order_by(
            pins.c.pinned_at.desc().nullslast(),
            recent.c.last_completed_date.desc().nullslast(),
            Exercise.name_ru.asc(),
        )

    count_statement = (
        select(func.count())
        .select_from(Exercise)
        .outerjoin(pins, pins.c.exercise_id == Exercise.id)
        .outerjoin(recent, recent.c.exercise_id == Exercise.id)
        .where(*filters)
    )
    total = int(await session.scalar(count_statement) or 0)
    rows = (
        await session.execute(
            joined.offset((page - 1) * page_size).limit(page_size)
        )
    ).all()
    groups = list(
        (
            await session.scalars(
                select(Exercise.muscle_group)
                .where(Exercise.is_deleted.is_(False))
                .distinct()
                .order_by(Exercise.muscle_group.asc())
            )
        ).all()
    )
    return {
        "items": [
            {
                **exercise.__dict__,
                "is_pinned": pinned_at is not None,
                "last_completed_date": last_completed_date,
                "completed_workouts": int(completed_workouts or 0),
            }
            for exercise, pinned_at, last_completed_date, completed_workouts in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "muscle_groups": groups,
        "pin_limit": PIN_LIMIT,
    }


async def _active_exercise_exists(session: AsyncSession, exercise_id: uuid.UUID) -> bool:
    value = await session.scalar(
        select(Exercise.id).where(
            Exercise.id == exercise_id,
            Exercise.is_deleted.is_(False),
        )
    )
    return value is not None


async def pin_state(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
) -> dict[str, object]:
    if not await _active_exercise_exists(session, exercise_id):
        raise ExerciseUnavailableError
    existing = await session.scalar(
        select(UserExercisePin.exercise_id).where(
            UserExercisePin.user_id == user_id,
            UserExercisePin.exercise_id == exercise_id,
        )
    )
    count = int(
        await session.scalar(
            select(func.count())
            .select_from(UserExercisePin)
            .where(UserExercisePin.user_id == user_id)
        )
        or 0
    )
    return {
        "exercise_id": exercise_id,
        "is_pinned": existing is not None,
        "pinned_count": count,
        "pin_limit": PIN_LIMIT,
    }


async def set_pinned(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    pinned: bool,
) -> dict[str, object]:
    """Set pin state idempotently while serializing changes per user."""

    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    if not await _active_exercise_exists(session, exercise_id):
        raise ExerciseUnavailableError
    existing = await session.scalar(
        select(UserExercisePin).where(
            UserExercisePin.user_id == user_id,
            UserExercisePin.exercise_id == exercise_id,
        )
    )
    count = int(
        await session.scalar(
            select(func.count())
            .select_from(UserExercisePin)
            .where(UserExercisePin.user_id == user_id)
        )
        or 0
    )
    if pinned and existing is None:
        if count >= PIN_LIMIT:
            raise ExercisePinLimitError
        session.add(UserExercisePin(user_id=user_id, exercise_id=exercise_id))
        count += 1
    elif not pinned and existing is not None:
        await session.delete(existing)
        count = max(0, count - 1)
    await session.commit()
    return {
        "exercise_id": exercise_id,
        "is_pinned": pinned,
        "pinned_count": count,
        "pin_limit": PIN_LIMIT,
    }


async def merge_user_pins(
    session: AsyncSession,
    *,
    source_user_id: uuid.UUID,
    target_user_id: uuid.UUID,
    prefer_source: bool,
) -> None:
    """Merge the ordered union of two accounts without exceeding the pin cap."""

    async def rows_for(user_id: uuid.UUID) -> list[UserExercisePin]:
        return list(
            (
                await session.scalars(
                    select(UserExercisePin)
                    .where(UserExercisePin.user_id == user_id)
                    .order_by(UserExercisePin.created_at.asc())
                )
            ).all()
        )

    target_rows = await rows_for(target_user_id)
    source_rows = await rows_for(source_user_id)
    preferred = source_rows if prefer_source else target_rows
    secondary = target_rows if prefer_source else source_rows
    selected_ids: list[uuid.UUID] = []
    for row in [*preferred, *secondary]:
        if row.exercise_id not in selected_ids and len(selected_ids) < PIN_LIMIT:
            selected_ids.append(row.exercise_id)

    target_ids = {row.exercise_id for row in target_rows}
    for row in [*target_rows, *source_rows]:
        if row.exercise_id not in selected_ids:
            await session.delete(row)
        elif row.user_id == source_user_id:
            if row.exercise_id in target_ids:
                await session.delete(row)
            else:
                row.user_id = target_user_id
