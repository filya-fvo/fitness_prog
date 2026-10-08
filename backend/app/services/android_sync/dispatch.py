"""Reuse domain routes, including their existing subscription/access decisions."""

import uuid
from datetime import date
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.routers import workouts, nutrition, body_measurements
from app.schemas.workout import (
    WorkoutCreate,
    WorkoutSetCreate,
    WorkoutPlan,
    WorkoutCompleteRequest,
    WorkoutUpdateRequest,
)
from app.schemas.nutrition import (
    NutritionProductCreate,
    NutritionLogCreate,
    NutritionLogUpdate,
)
from app.schemas.body_measurements import BodyMeasurementUpdate
from app.schemas.android_sync import Operation


async def dispatch(session: AsyncSession, user: User, op: Operation):
    body, action = op.body, op.action
    if op.kind == "workout":
        if action == "create":
            payload = WorkoutCreate.model_validate({**body, "client_workout_id": op.entityId})
            return await workouts.create_workout(payload, session, user)
        identity = uuid.UUID(op.entityId)
        if action == "set":
            return await workouts.add_set(
                identity, WorkoutSetCreate.model_validate(body), session, user
            )
        if action == "plan":
            return await workouts.update_workout_plan(
                identity, WorkoutPlan.model_validate(body), session, user
            )
        if action == "complete":
            return await workouts.complete_workout(
                identity, WorkoutCompleteRequest.model_validate(body), session, user
            )
        if action == "update":
            return await workouts.update_workout(
                identity, WorkoutUpdateRequest.model_validate(body), session, user
            )
        if action == "delete":
            return await workouts.delete_workout(identity, session, user)
    elif op.kind == "nutrition_log":
        if action == "create":
            return await nutrition.add_log(NutritionLogCreate.model_validate(body), session, user)
        identity = uuid.UUID(op.entityId)
        if action == "update":
            return await nutrition.update_log(
                identity, NutritionLogUpdate.model_validate(body), session, user
            )
        if action == "delete":
            return await nutrition.delete_log(identity, session, user)
    elif op.kind == "measurement":
        day = date.fromisoformat(op.entityId)
        if action == "upsert":
            return await body_measurements.put_daily_measurement(
                BodyMeasurementUpdate.model_validate(body), day, session, user
            )
        if action == "delete":
            return await body_measurements.delete_daily_measurement(day, session, user)
    elif op.kind == "product" and action == "create":
        return await nutrition.create_product(
            NutritionProductCreate.model_validate(body), session, user
        )
    raise HTTPException(422, "Недопустимая операция синхронизации")
