"""Prepare existing program variants without creating or consuming diary state."""

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.offline_workouts import (
    OfflineWorkoutContext,
    OfflineWorkoutDay,
    PreparedProgramPlan,
)
from app.schemas.program import ProgramResponse
from app.schemas.scheduler import WorkoutScheduleOverview
from app.schemas.workout import WorkoutPlan
from app.services import cycle_training, illness_pause, program_service, scheduler, workout_service


def _day_indexes(structure: dict[str, Any]) -> list[int]:
    rows = structure.get("schedule") or structure.get("days") or []
    if not isinstance(rows, list) or not 1 <= len(rows) <= 7:
        raise HTTPException(422, "Для этой программы пока недоступна подготовка без сети")
    try:
        indexes = [
            int(row.get("day_index", row.get("day", pos))) for pos, row in enumerate(rows, 1)
        ]
    except (TypeError, ValueError, AttributeError) as exc:
        raise HTTPException(422, "Не удалось проверить дни программы") from exc
    if set(indexes) != set(range(1, len(rows) + 1)):
        raise HTTPException(422, "Не удалось проверить дни программы")
    return sorted(indexes)


async def prepare_context(
    session: AsyncSession,
    user: User,
    *,
    start: date,
    days: int = 14,
) -> OfflineWorkoutContext:
    if not 1 <= days <= 14:
        raise HTTPException(422, "Можно подготовить от 1 до 14 дней")
    end = start + timedelta(days=days - 1)
    active_id = (user.goals or {}).get("active_program_id")
    program = None
    if active_id:
        try:
            program_id = UUID(str(active_id))
        except ValueError as exc:
            raise HTTPException(422, "Выберите программу заново") from exc
        program = await program_service.get_program(
            session,
            program_id,
            active_program_id=active_id,
            user_id=user.id,
        )
        if program is None:
            raise HTTPException(404, "Активная программа недоступна")
    result = OfflineWorkoutContext(
        owner=user.id,
        prepared_at=datetime.now(UTC),
        start=start,
        end=end,
        program=ProgramResponse.model_validate(program) if program else None,
        days=[],
    )
    last_completed = await scheduler.latest_completed_workout_date(session, user)
    targets: set[date] = set()
    lower_bound = scheduler.program_schedule_start(user.goals or {})
    for offset in range(days):
        day = start + timedelta(days=offset)
        overview = WorkoutScheduleOverview.model_validate(
            await scheduler.get_schedule_overview(session, user, day),
        )
        overview.last_completed_date = last_completed
        result.days.append(OfflineWorkoutDay(requested_date=day, schedule=overview))
        current = overview.current
        if program is None or illness_pause.is_illness_day(user.goals or {}, day):
            continue
        if current is None:
            target = day  # Existing program page permits a workout on a free day.
        elif current.status in {"scheduled", "missed"} and current.program_id in {None, program.id}:
            target = current.target_date
        else:
            continue
        if target <= end and (lower_bound is None or target >= lower_bound):
            targets.add(target)
    if program is not None:
        indexes = _day_indexes(program.structure or {})
        readiness_values = (
            ["normal", "caution", "reduce", "rest"]
            if cycle_training.cycle_training_enabled(user.goals, user.anthropometry)
            else ["normal"]
        )
        for target in sorted(targets):
            for index in indexes:
                for phase in ("light", "medium", "heavy"):
                    for readiness in readiness_values:
                        plan = await workout_service.build_program_plan_for_user(
                            session,
                            user,
                            program,
                            day_index=index,
                            scheduled_date=target,
                            week_phase=phase,
                            consume_saved_override=False,
                            cycle_readiness=readiness,
                        )
                        result.plans.append(
                            PreparedProgramPlan(
                                scheduled_date=target,
                                day_index=index,
                                week_phase=phase,
                                readiness=readiness,
                                plan=WorkoutPlan.model_validate(plan),
                            )
                        )
    # Native transport is bounded to 8MiB. Leave room for encoding and middleware.
    if len(result.model_dump_json().encode("utf-8")) > 6 * 1024 * 1024:
        raise HTTPException(413, "Планы слишком большие. Подготовьте меньше дней")
    return result
