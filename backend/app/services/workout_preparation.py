"""Canonical identity for prepared plans; suggested loads are advisory, not topology."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import select
from app.models.workout import Workout
from app.schemas.workout import WorkoutPlan
from app.services.offline_schedule import schedule_fingerprint
from app.services.workout_target_compatibility import restore_omitted_targets


def plan_fingerprint(user, program, plan, *, scheduled_date, day_index, week_phase, cycle_readiness):
    parsed = WorkoutPlan.model_validate(plan)
    content = parsed.model_dump(exclude={"exercises": {"__all__": {"suggested_weight", "name_ru"}}})
    content["exercises"].sort(key=lambda row: row["order"])
    content["groups"].sort(key=lambda row: str(row["id"]))
    for row in content["exercises"]:
        if row.get("target") is None:
            row.pop("target", None)
        row["set_methods"].sort(key=lambda method: method["set_number"])
    def encode(value):
        return str(value.normalize()) if isinstance(value, Decimal) else str(value)
    value = {"owner": str(user.id), "program": str(program.id), "version": program.version,
        "date": str(scheduled_date), "day": day_index, "phase": week_phase or parsed.week_phase,
        "readiness": cycle_readiness or "normal", "plan": content}
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=encode).encode()).hexdigest()


async def validate_prepared_start(session, user, program, data, expected):
    if data.plan is not None:
        data.plan = restore_omitted_targets(data.plan, expected)
    stamp = data.preparation
    if stamp is None:
        return
    if stamp.prepared_at > datetime.now(UTC) + timedelta(minutes=5):
        raise HTTPException(422, "Не удалось проверить время подготовки")
    if stamp.schedule_fingerprint != schedule_fingerprint(user.goals or {}):
        raise HTTPException(409, "Расписание изменилось после подготовки. Результат сохранён на устройстве")
    existing = await session.scalar(select(Workout.id).where(Workout.user_id == user.id,
        Workout.program_id == program.id, Workout.scheduled_date == data.scheduled_date, Workout.is_deleted.is_(False)))
    if existing is not None:
        raise HTTPException(409, "Тренировка на эту дату уже есть. Результат сохранён на устройстве")
    context = {"scheduled_date": data.scheduled_date, "day_index": data.day_index,
        "week_phase": data.week_phase, "cycle_readiness": data.cycle_readiness}
    if stamp.plan_fingerprint != plan_fingerprint(user, program, expected, **context) or stamp.plan_fingerprint != plan_fingerprint(user, program, data.plan, **context):
        raise HTTPException(409, "Личный план изменился после подготовки. Результат сохранён на устройстве")
