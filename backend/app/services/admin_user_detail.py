"""Read models and safe administrator actions for one user card."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.admin_audit_log import AdminAuditLog
from app.models.ai_conversation import AIConversation
from app.models.body_measurement import BodyMeasurement
from app.models.daily_metric import DailyMetric
from app.models.nutrition import NutritionLog
from app.models.program import Program
from app.models.supplement_intake import WebPushSubscription
from app.models.user import User
from app.models.workout import Workout
from app.schemas.admin_user import (
    AdminNotificationCategory,
    AdminUserActivity,
    AdminUserCommunications,
    AdminUserNextWorkout,
    AdminUserProgramSummary,
    AdminUserQuestionnaire,
    AdminUserRecordCounts,
    AdminUserSafeEvent,
    AdminUserSummary,
    AdminUserWorkoutSummary,
    AdminWebPushSummary,
)
from app.services import admin_users
from app.services.notification_prefs import local_now, merge_notification_settings
from app.services.scheduler import get_schedule_overview

_CATEGORY_TITLES = {
    "measurements": "Замеры",
    "workouts": "Тренировки",
    "supplements": "Добавки",
    "water": "Вода",
    "calories": "Калории",
}


def _mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _optional_text(value: object, *, limit: int = 300) -> str | None:
    text = str(value or "").strip()
    return text[:limit] if text else None


def _optional_int(value: object) -> int | None:
    try:
        return int(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def _optional_float(value: object) -> float | None:
    try:
        return float(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def _string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip()[:80] for item in value if str(item).strip()][:30]
    if isinstance(value, str) and value.strip():
        return [value.strip()[:80]]
    return []


def questionnaire_snapshot(user: User) -> AdminUserQuestionnaire:
    """Return an allowlisted questionnaire view without raw JSON blobs."""
    anthropometry = _mapping(user.anthropometry)
    goals = _mapping(user.goals)
    raw_birth_date = _optional_text(anthropometry.get("birth_date"), limit=10)
    try:
        birth_date = date.fromisoformat(raw_birth_date) if raw_birth_date else None
    except ValueError:
        birth_date = None
    return AdminUserQuestionnaire(
        sex=_optional_text(anthropometry.get("sex") or goals.get("sex"), limit=20),
        age=_optional_int(anthropometry.get("age")),
        birth_date=birth_date,
        height_cm=_optional_float(anthropometry.get("height_cm")),
        weight_kg=_optional_float(anthropometry.get("weight_kg")),
        target_weight_kg=_optional_float(goals.get("target_weight_kg")),
        primary_goal=_optional_text(goals.get("primary_goal"), limit=60),
        level=_optional_text(goals.get("level"), limit=40),
        activity_level=_optional_text(
            goals.get("activity_level") or anthropometry.get("activity_level"), limit=40
        ),
        days_per_week=_optional_int(goals.get("days_per_week")),
        location=_optional_text(goals.get("location"), limit=40),
        equipment=_string_list(goals.get("equipment")),
        limitations=_string_list(goals.get("limitations")),
        limitations_note=_optional_text(goals.get("limitations_note")),
    )


def merge_state(user: User) -> tuple[str, int, str | None]:
    goals = _mapping(user.goals)
    sources = goals.get("_merged_from_user_ids")
    source_count = len(sources) if isinstance(sources, list) else 0
    preference = goals.get("_last_merge_preference")
    safe_preference = preference if preference in {"email", "telegram"} else None
    if user.merged_into_user_id is not None:
        state = "merged_source"
    elif source_count:
        state = "merged_primary"
    elif user.telegram_id is not None and user.auth_email:
        state = "linked"
    else:
        state = "separate"
    return state, source_count, safe_preference


async def _last_activity_at(session: AsyncSession, user: User):
    sources = union_all(
        select(User.updated_at.label("occurred_at")).where(User.id == user.id),
        select(Workout.updated_at.label("occurred_at")).where(
            Workout.user_id == user.id, Workout.is_deleted.is_(False)
        ),
        select(NutritionLog.updated_at.label("occurred_at")).where(
            NutritionLog.user_id == user.id, NutritionLog.is_deleted.is_(False)
        ),
        select(DailyMetric.updated_at.label("occurred_at")).where(
            DailyMetric.user_id == user.id, DailyMetric.is_deleted.is_(False)
        ),
        select(BodyMeasurement.updated_at.label("occurred_at")).where(
            BodyMeasurement.user_id == user.id, BodyMeasurement.is_deleted.is_(False)
        ),
        select(AIConversation.timestamp.label("occurred_at")).where(
            AIConversation.user_id == user.id, AIConversation.is_deleted.is_(False)
        ),
    ).subquery()
    return await session.scalar(select(func.max(sources.c.occurred_at)))


async def get_summary(session: AsyncSession, user_id: uuid.UUID) -> AdminUserSummary:
    user = await admin_users.get_user_or_404(session, user_id)
    goals = _mapping(user.goals)
    active_program: AdminUserProgramSummary | None = None
    try:
        program_id = uuid.UUID(str(goals.get("active_program_id") or ""))
    except ValueError:
        program_id = None
    if program_id is not None:
        program = await session.scalar(
            select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
        )
        if program is not None:
            active_program = AdminUserProgramSummary(
                id=program.id,
                name=program.name,
                next_day=_optional_int(goals.get("active_program_next_day")),
                week_phase=_optional_text(goals.get("active_program_week_phase"), limit=40),
            )
    state, source_count, preference = merge_state(user)
    login_methods = []
    if user.telegram_id is not None:
        login_methods.append("telegram")
    if user.auth_email:
        login_methods.append("email")
    return AdminUserSummary(
        id=user.id,
        display_name=admin_users.display_name(user),
        telegram_id=user.telegram_id,
        username=user.username,
        auth_email=user.auth_email,
        login_methods=login_methods,
        merge_state=state,
        merged_sources_count=source_count,
        last_merge_preference=preference,
        registered_at=user.created_at,
        last_activity_at=await _last_activity_at(session, user),
        onboarding_completed=bool(goals.get("onboarding_completed")),
        questionnaire=questionnaire_snapshot(user),
        active_program=active_program,
        subscription_status=user.subscription_status or "free",
        stars_balance=user.stars_balance or 0,
    )


def _next_workout(overview: dict[str, Any]) -> AdminUserNextWorkout | None:
    current = overview.get("current")
    candidate = current if isinstance(current, dict) and current.get("status") == "scheduled" else None
    if candidate is None:
        candidate = overview.get("next")
    if not isinstance(candidate, dict):
        return None
    return AdminUserNextWorkout(
        target_date=candidate["target_date"],
        start_time=candidate["start_time"],
        title=str(candidate.get("title") or "Тренировка"),
        program_id=candidate.get("program_id"),
        day_index=candidate.get("day_index"),
        status=str(candidate.get("status") or "scheduled"),
    )


async def get_activity(session: AsyncSession, user_id: uuid.UUID) -> AdminUserActivity:
    user = await admin_users.get_user_or_404(session, user_id)
    settings = merge_notification_settings(
        _mapping(_mapping(user.goals).get("notification_settings"))
    )
    overview = await get_schedule_overview(
        session, user, local_now(str(settings.get("timezone") or "Europe/Moscow")).date()
    )
    workouts = list(
        (
            await session.scalars(
                select(Workout)
                .where(Workout.user_id == user.id, Workout.is_deleted.is_(False))
                .options(selectinload(Workout.sets))
                .order_by(
                    Workout.completed_at.desc().nullslast(),
                    Workout.scheduled_date.desc(),
                    Workout.created_at.desc(),
                )
                .limit(5)
            )
        ).all()
    )
    recent = []
    for workout in workouts:
        active_sets = [item for item in workout.sets if not item.is_deleted]
        recent.append(
            AdminUserWorkoutSummary(
                id=workout.id,
                scheduled_date=workout.scheduled_date,
                title=workout.title or _mapping(workout.plan).get("title") or "Тренировка",
                status=workout.status,
                workout_type=workout.workout_type,
                rpe=workout.rpe,
                duration_sec=workout.duration_sec,
                sets_count=len(active_sets),
                completed_sets=sum(1 for item in active_sets if item.is_completed),
                completed_at=workout.completed_at,
            )
        )
    counts_row = (
        await session.execute(
            select(
                func.count(Workout.id),
                func.count(Workout.id).filter(Workout.status == "completed"),
            ).where(Workout.user_id == user.id, Workout.is_deleted.is_(False))
        )
    ).one()
    nutrition_count = await session.scalar(
        select(func.count(NutritionLog.id)).where(
            NutritionLog.user_id == user.id, NutritionLog.is_deleted.is_(False)
        )
    )
    measurement_count = await session.scalar(
        select(func.count(BodyMeasurement.id)).where(
            BodyMeasurement.user_id == user.id, BodyMeasurement.is_deleted.is_(False)
        )
    )
    weight_count = await session.scalar(
        select(func.count(DailyMetric.id)).where(
            DailyMetric.user_id == user.id,
            DailyMetric.weight_kg.is_not(None),
            DailyMetric.is_deleted.is_(False),
        )
    )
    return AdminUserActivity(
        next_workout=_next_workout(overview),
        recent_workouts=recent,
        counts=AdminUserRecordCounts(
            workouts=int(counts_row[0] or 0),
            completed_workouts=int(counts_row[1] or 0),
            nutrition_logs=int(nutrition_count or 0),
            body_measurements=int(measurement_count or 0),
            daily_weight_entries=int(weight_count or 0),
        ),
    )


def _category_details(key: str, value: dict[str, Any]) -> str:
    if key == "workouts":
        days = value.get("days") if isinstance(value.get("days"), list) else []
        return f"{value.get('time', '—')} · дней в расписании: {len(days)}"
    if key == "measurements":
        return f"{value.get('time', '—')} · каждые {value.get('interval_days', '—')} дн."
    if key == "water":
        return f"{value.get('start_time', '—')}–{value.get('end_time', '—')}"
    if key == "calories":
        times = value.get("times") if isinstance(value.get("times"), list) else []
        return ", ".join(str(item) for item in times) or "Время не задано"
    return "По расписанию пользователя"


async def get_communications(
    session: AsyncSession, user_id: uuid.UUID
) -> AdminUserCommunications:
    user = await admin_users.get_user_or_404(session, user_id)
    settings = merge_notification_settings(
        _mapping(_mapping(user.goals).get("notification_settings"))
    )
    categories = [
        AdminNotificationCategory(
            key=key,
            title=title,
            enabled=bool(_mapping(settings.get(key)).get("enabled")),
            details=_category_details(key, _mapping(settings.get(key))),
        )
        for key, title in _CATEGORY_TITLES.items()
    ]
    push_rows = list(
        (
            await session.scalars(
                select(WebPushSubscription).where(
                    WebPushSubscription.user_id == user.id,
                    WebPushSubscription.is_deleted.is_(False),
                )
            )
        ).all()
    )
    actor = aliased(User)
    event_rows = (
        await session.execute(
            select(AdminAuditLog, actor.username)
            .outerjoin(actor, actor.id == AdminAuditLog.actor_user_id)
            .where(AdminAuditLog.object_type == "user", AdminAuditLog.object_id == user.id)
            .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
            .limit(10)
        )
    ).all()
    events = [
        AdminUserSafeEvent(
            id=event.id,
            actor_label=(
                f"@{username.lstrip('@')}"
                if username
                else f"Администратор {str(event.actor_user_id)[:8]}"
                if event.actor_user_id
                else "Удалённый администратор"
            ),
            action=event.action,
            result=event.result,
            description=event.description,
            notification_status=event.notification_status,
            created_at=event.created_at,
        )
        for event, username in event_rows
    ]
    success_dates = [item.last_success_at for item in push_rows if item.last_success_at]
    return AdminUserCommunications(
        telegram_available=user.telegram_id is not None,
        reminders_enabled=any(item.enabled for item in categories),
        timezone=str(settings.get("timezone") or "Europe/Moscow"),
        categories=categories,
        web_push=AdminWebPushSummary(
            total=len(push_rows),
            active=sum(1 for item in push_rows if item.disabled_at is None),
            last_success_at=max(success_dates) if success_dates else None,
            failures=sum(max(0, item.failure_count or 0) for item in push_rows),
        ),
        recent_events=events,
    )
