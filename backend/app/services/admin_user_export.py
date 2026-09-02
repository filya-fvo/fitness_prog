"""Allowlisted user data export for administrator-assisted requests."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai_conversation import AIConversation
from app.models.body_measurement import BodyMeasurement
from app.models.daily_metric import DailyMetric
from app.models.nutrition import NutritionLog
from app.models.supplement_intake import SupplementIntake
from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan_override import WorkoutPlanOverride
from app.services import admin_audit, admin_users


def export_row(row: object, *, exclude: set[str] | None = None) -> dict[str, Any]:
    """Serialize only mapped columns from an explicitly selected safe model."""
    blocked = exclude or set()
    values = {
        attribute.key: getattr(row, attribute.key)
        for attribute in inspect(row).mapper.column_attrs
        if attribute.key not in blocked
    }
    return jsonable_encoder(values)


async def _active_rows(session: AsyncSession, model, user_id: uuid.UUID) -> list[object]:
    return list(
        (
            await session.scalars(
                select(model)
                .where(model.user_id == user_id, model.is_deleted.is_(False))
                .order_by(model.created_at.asc(), model.id.asc())
            )
        ).all()
    )


async def prepare_user_export(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    context: admin_audit.AuditContext,
) -> dict[str, Any]:
    user = await admin_users.get_user_or_404(session, user_id)
    workouts = list(
        (
            await session.scalars(
                select(Workout)
                .where(Workout.user_id == user.id, Workout.is_deleted.is_(False))
                .options(selectinload(Workout.sets))
                .order_by(Workout.created_at.asc(), Workout.id.asc())
            )
        ).all()
    )
    workout_rows = []
    for workout in workouts:
        value = export_row(workout)
        value["sets"] = [
            export_row(item)
            for item in workout.sets
            if not item.is_deleted
        ]
        workout_rows.append(value)

    collections = {
        "workouts": workout_rows,
        "nutrition_logs": [
            export_row(item) for item in await _active_rows(session, NutritionLog, user.id)
        ],
        "daily_metrics": [
            export_row(item) for item in await _active_rows(session, DailyMetric, user.id)
        ],
        "body_measurements": [
            export_row(item) for item in await _active_rows(session, BodyMeasurement, user.id)
        ],
        "ai_conversations": [
            export_row(item) for item in await _active_rows(session, AIConversation, user.id)
        ],
        "supplement_intakes": [
            export_row(item) for item in await _active_rows(session, SupplementIntake, user.id)
        ],
        "workout_plan_overrides": [
            export_row(item)
            for item in await _active_rows(session, WorkoutPlanOverride, user.id)
        ],
    }
    admin_audit.add_event(
        session,
        context=context,
        action="user.export.prepare",
        object_type="user",
        object_id=user.id,
        result="success",
        description="Подготовлен файл с данными пользователя.",
        after=admin_audit.user_change_snapshot(channel="download", requested=True),
        notification_status="not_requested",
    )
    await session.commit()
    return {
        "format_version": 1,
        "generated_at": datetime.now(UTC),
        "user": export_row(user, exclude={"is_deleted"}),
        **collections,
    }


async def prepare_users_summary_export(
    session: AsyncSession,
    user_ids: list[uuid.UUID],
    *,
    context: admin_audit.AuditContext,
) -> dict[str, Any]:
    """Export an allowlisted admin registry for at most 50 explicitly selected users."""
    unique_ids = list(dict.fromkeys(user_ids))
    users = list(
        (
            await session.scalars(
                select(User).where(
                    User.id.in_(unique_ids),
                    User.is_deleted.is_(False),
                )
            )
        ).all()
    )
    by_id = {user.id: user for user in users}
    counts: dict[uuid.UUID, tuple[int, int]] = {}
    if by_id:
        rows = await session.execute(
            select(
                Workout.user_id,
                func.count(Workout.id),
                func.count(Workout.id).filter(Workout.status == "completed"),
            )
            .where(Workout.user_id.in_(list(by_id)), Workout.is_deleted.is_(False))
            .group_by(Workout.user_id)
        )
        counts = {
            user_id: (int(total or 0), int(completed or 0))
            for user_id, total, completed in rows.all()
        }

    items = []
    for user_id in unique_ids:
        user = by_id.get(user_id)
        if user is None:
            continue
        total, completed = counts.get(user.id, (0, 0))
        items.append(
            jsonable_encoder(
                admin_users.to_admin_row(
                    user,
                    workouts_count=total,
                    completed_workouts=completed,
                )
            )
        )

    admin_audit.add_event(
        session,
        context=context,
        action="user.export.group",
        object_type="audit_export",
        object_id=None,
        result="success",
        description="Подготовлен групповой реестр выбранных пользователей.",
        after={"format": "json", "exported_count": len(items), "total_matches": len(unique_ids)},
        notification_status="not_requested",
    )
    await session.commit()
    return {
        "format_version": 1,
        "generated_at": datetime.now(UTC),
        "selected_count": len(unique_ids),
        "exported_count": len(items),
        "items": items,
    }
