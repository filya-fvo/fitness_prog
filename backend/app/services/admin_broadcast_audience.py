"""Allowlisted audience filters for administrator broadcasts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_conversation import AIConversation
from app.models.daily_metric import DailyMetric
from app.models.nutrition import NutritionLog
from app.models.user import User
from app.models.workout import Workout
from app.schemas.admin_broadcast import AdminBroadcastAudience


def audience_statement(audience: AdminBroadcastAudience, *, now: datetime | None = None):
    """Build the only supported recipient query; raw SQL/admin expressions are forbidden."""
    current = now or datetime.now(UTC)
    filters = [User.is_deleted.is_(False), User.telegram_id.is_not(None)]

    if audience.kind == "active":
        cutoff = current - timedelta(days=audience.days or 1)
        filters.append(
            or_(
                User.updated_at >= cutoff,
                select(Workout.id)
                .where(
                    Workout.user_id == User.id,
                    Workout.is_deleted.is_(False),
                    Workout.updated_at >= cutoff,
                )
                .exists(),
                select(NutritionLog.id)
                .where(
                    NutritionLog.user_id == User.id,
                    NutritionLog.is_deleted.is_(False),
                    NutritionLog.created_at >= cutoff,
                )
                .exists(),
                select(DailyMetric.id)
                .where(
                    DailyMetric.user_id == User.id,
                    DailyMetric.is_deleted.is_(False),
                    DailyMetric.date >= cutoff.date(),
                )
                .exists(),
                select(AIConversation.id)
                .where(
                    AIConversation.user_id == User.id,
                    AIConversation.is_deleted.is_(False),
                    AIConversation.timestamp >= cutoff,
                )
                .exists(),
            )
        )
    elif audience.kind == "onboarding_incomplete":
        filters.append(func.coalesce(User.goals["onboarding_completed"].astext, "false") != "true")
    elif audience.kind == "inactive_workouts":
        cutoff = current - timedelta(days=audience.days or 1)
        filters.append(
            ~select(Workout.id)
            .where(
                Workout.user_id == User.id,
                Workout.is_deleted.is_(False),
                Workout.status == "completed",
                Workout.completed_at >= cutoff,
            )
            .exists()
        )
    elif audience.kind == "program":
        filters.append(User.goals["active_program_id"].astext == str(audience.program_id))
    elif audience.kind == "subscription":
        filters.append(User.subscription_status == audience.subscription_status)

    return select(User.id, User.telegram_id).where(*filters).order_by(User.id.asc())


async def audience_count(session: AsyncSession, audience: AdminBroadcastAudience) -> int:
    subquery = audience_statement(audience).subquery()
    return int(await session.scalar(select(func.count()).select_from(subquery)) or 0)


async def audience_recipients(
    session: AsyncSession, audience: AdminBroadcastAudience
) -> list[tuple[object, int]]:
    rows = (await session.execute(audience_statement(audience))).all()
    return [(user_id, int(telegram_id)) for user_id, telegram_id in rows if telegram_id is not None]
