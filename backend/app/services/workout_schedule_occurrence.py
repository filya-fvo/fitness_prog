"""Account-scoped identity and prepared data for one effective workout slot."""

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select, union_all, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_program_day_override import UserProgramDayOverride
from app.models.workout import Workout
from app.models.workout_plan_override import WorkoutPlanOverride
from app.services import planned_workout
from app.services.workout_customization_dates import change_customization_date

OCCURRENCE_CHANGED = "Программа или день тренировки изменились. Обновите расписание и повторите действие."
OCCURRENCE_UNKNOWN = "Не удалось определить занятие. Обновите расписание и повторите действие."
PREPARATION_CONFLICT = "На выбранную дату уже есть подготовка. Сначала проверьте её"
RESCHEDULE_RECEIPTS_KEY = "workout_reschedule_requests"


@dataclass(frozen=True, slots=True)
class OccurrenceScope:
    program_id: UUID
    day_index: int


def occurrence_scope(
    goals: dict,
    override: dict | None = None,
    *,
    expected_program_id: UUID | None = None,
    expected_day_index: int | None = None,
) -> OccurrenceScope | None:
    """Use the pinned identity when available, otherwise the recurring program day."""
    override = override or {}
    active = goals.get("active_program_id")
    pinned = override.get("program_id")
    if pinned and active and str(pinned) != str(active):
        raise HTTPException(409, OCCURRENCE_CHANGED)
    program = pinned or active
    scope = None
    if program:
        try:
            day = int(override.get("day_index") or goals.get("active_program_next_day") or 1)
            if not 1 <= day <= 7:
                raise ValueError("Invalid program day")
            scope = OccurrenceScope(UUID(str(program)), day)
        except (TypeError, ValueError) as exc:
            raise HTTPException(409, OCCURRENCE_UNKNOWN) from exc
    if expected_program_id is not None and (scope is None or scope.program_id != expected_program_id):
        raise HTTPException(409, OCCURRENCE_CHANGED)
    if expected_day_index is not None and (scope is None or scope.day_index != expected_day_index):
        raise HTTPException(409, OCCURRENCE_CHANGED)
    return scope


def matches_scope(override: dict, scope: OccurrenceScope | None) -> bool:
    if scope is None:
        return not override.get("program_id")
    return (
        str(override.get("program_id") or scope.program_id) == str(scope.program_id)
        and str(override.get("day_index") or scope.day_index) == str(scope.day_index)
    )


def workouts_in_slot(
    user_id: UUID, dates: set[date], scope: OccurrenceScope | None, *, workout_status: str | tuple[str, ...], include_unknown: bool,
):
    filters = [
        Workout.user_id == user_id,
        Workout.scheduled_date.in_(dates),
        Workout.status == workout_status if isinstance(workout_status, str) else Workout.status.in_(workout_status),
        Workout.is_deleted.is_(False),
    ]
    if scope is not None:
        day = Workout.plan["day_index"].astext
        if include_unknown:
            filters.append(or_(
                Workout.program_id.is_(None),
                (Workout.program_id == scope.program_id) & or_(
                    day == str(scope.day_index), day.is_(None), day.not_in(tuple("1234567")),
                ),
            ))
        else:
            filters.extend((Workout.program_id == scope.program_id, day == str(scope.day_index)))
    return filters


async def move_preparations(
    session: AsyncSession, user_id: UUID, source_date: date, target_date: date, scope: OccurrenceScope,
) -> None:
    if source_date == target_date:
        return
    dates = await preparation_dates(session, user_id, {source_date, target_date}, scope)
    if source_date in dates and target_date in dates:
        raise HTTPException(409, PREPARATION_CONFLICT)
    await planned_workout.move_saved_overrides(
        session, user_id=user_id, source_date=source_date, target_date=target_date,
        program_id=scope.program_id, day_index=scope.day_index,
    )
    await change_customization_date(session, user_id, source_date, target_date, scope.program_id, scope.day_index)


async def preparation_dates(
    session: AsyncSession, user_id: UUID, dates: set[date], scope: OccurrenceScope,
) -> set[date]:
    occupied = union_all(*(
        select(model.scheduled_date).where(
            model.user_id == user_id,
            model.program_id == scope.program_id,
            model.day_index == scope.day_index,
            model.scheduled_date.in_(dates),
            model.is_deleted.is_(False),
        )
        for model in (UserProgramDayOverride, WorkoutPlanOverride)
    ))
    return set((await session.scalars(occupied)).all())


async def require_unstarted(
    session: AsyncSession, user_id: UUID, source_date: date, scope: OccurrenceScope | None,
) -> None:
    if scope is None:
        return
    slot = workouts_in_slot(
        user_id, {source_date}, scope, workout_status="planned", include_unknown=True,
    )
    started = select(Workout.id).where(*slot, Workout.started_at.is_not(None)).limit(1)
    if await session.scalar(started) is not None:
        raise HTTPException(409, "Начатую тренировку перенести или отменить нельзя")


async def move_pending_occurrence(
    session: AsyncSession, user_id: UUID, source_date: date, target_date: date, scope: OccurrenceScope | None,
) -> None:
    if scope is None or source_date == target_date:
        return
    await require_unstarted(session, user_id, source_date, scope)
    occupied = select(Workout.id).where(
        Workout.user_id == user_id,
        Workout.scheduled_date == target_date,
        Workout.is_deleted.is_(False),
        or_(Workout.program_id == scope.program_id, Workout.program_id.is_(None)),
    ).limit(1)
    if await session.scalar(occupied) is not None:
        raise HTTPException(409, "На выбранную дату уже начата тренировка. Выберите другую дату.")
    await move_preparations(session, user_id, source_date, target_date, scope)
    await session.execute(
        update(Workout).where(*workouts_in_slot(
            user_id, {source_date}, scope, workout_status="planned", include_unknown=False,
        )).values(scheduled_date=target_date)
    )


async def cancel_pending_occurrence(
    session: AsyncSession, user_id: UUID, target_date: date, scope: OccurrenceScope | None,
) -> None:
    if scope is None:
        return
    await require_unstarted(session, user_id, target_date, scope)
    if await preparation_dates(session, user_id, {target_date}, scope):
        raise HTTPException(409, PREPARATION_CONFLICT)
    await session.execute(
        update(Workout).where(*workouts_in_slot(
            user_id, {target_date}, scope, workout_status="planned", include_unknown=False,
        )).values(status="skipped")
    )
