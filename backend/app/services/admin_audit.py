"""Append-only administrator audit journal and safe snapshots."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.admin_audit_log import AdminAuditLog
from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.schemas.admin_audit import AdminAuditActor, AdminAuditEntry

AuditResult = Literal["success", "failure"]
NotificationStatus = Literal["pending", "sent", "failed", "not_requested", "unavailable"]

_ACTION_PATTERN = re.compile(r"^[a-z][a-z0-9_.]{2,79}$")
_OBJECT_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
_USER_FIELDS = {"scope", "stats", "is_deleted", "channel", "requested"}
_EXERCISE_FIELDS = {
    "name",
    "muscle_group",
    "equipment",
    "difficulty",
    "media_source",
    "tags",
    "is_deleted",
}
_PROGRAM_FIELDS = {
    "name",
    "workout_type",
    "level",
    "target_level",
    "duration_weeks",
    "is_template",
    "days_count",
    "is_deleted",
}
_STAT_FIELDS = {
    "workout_sets",
    "workouts",
    "nutrition_logs",
    "daily_metrics",
    "body_measurements",
    "ai_conversations",
    "email_otp_codes",
    "water_days",
    "measurements",
    "weight_days",
}


@dataclass(frozen=True, slots=True)
class AuditContext:
    actor_user_id: uuid.UUID
    correlation_id: uuid.UUID


def _short_text(value: object, *, limit: int = 120) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] if text else None


def _days_count(structure: object) -> int:
    if not isinstance(structure, dict):
        return 0
    days = structure.get("days")
    if isinstance(days, list):
        return len(days)
    return sum(1 for value in structure.values() if isinstance(value, (dict, list)))


def exercise_snapshot(exercise: Exercise) -> dict[str, object]:
    """Return only catalog metadata; URLs and long instructional text stay out."""
    tags = exercise.tags if isinstance(exercise.tags, list) else []
    return {
        "name": _short_text(exercise.name_ru),
        "muscle_group": _short_text(exercise.muscle_group, limit=60),
        "equipment": _short_text(exercise.equipment, limit=60),
        "difficulty": int(exercise.difficulty),
        "media_source": _short_text(exercise.media_source, limit=40),
        "tags": [_short_text(tag, limit=40) for tag in tags[:20] if _short_text(tag, limit=40)],
        "is_deleted": bool(exercise.is_deleted),
    }


def program_snapshot(program: Program) -> dict[str, object]:
    """Return safe program metadata without descriptions or workout contents."""
    return {
        "name": _short_text(program.name),
        "workout_type": _short_text(program.workout_type, limit=60),
        "level": _short_text(program.level, limit=40),
        "target_level": _short_text(program.target_level, limit=40),
        "duration_weeks": program.duration_weeks,
        "is_template": bool(program.is_template),
        "days_count": _days_count(program.structure),
        "is_deleted": bool(program.is_deleted),
    }


def user_change_snapshot(
    *,
    scope: str | None = None,
    stats: dict[str, object] | None = None,
    is_deleted: bool | None = None,
    channel: str | None = None,
    requested: bool | None = None,
) -> dict[str, object]:
    snapshot: dict[str, object] = {}
    if scope is not None:
        snapshot["scope"] = _short_text(scope, limit=40)
    if stats is not None:
        snapshot["stats"] = {
            key: int(value)
            for key, value in stats.items()
            if key in _STAT_FIELDS and isinstance(value, int) and value >= 0
        }
    if is_deleted is not None:
        snapshot["is_deleted"] = is_deleted
    if channel is not None:
        snapshot["channel"] = _short_text(channel, limit=24)
    if requested is not None:
        snapshot["requested"] = requested
    return snapshot


def _sanitize_snapshot(object_type: str, value: dict[str, object]) -> dict[str, object]:
    allowed = {
        "user": _USER_FIELDS,
        "exercise": _EXERCISE_FIELDS,
        "program": _PROGRAM_FIELDS,
    }.get(object_type, set())
    return {key: item for key, item in value.items() if key in allowed}


def add_event(
    session: AsyncSession,
    *,
    context: AuditContext,
    action: str,
    object_type: str,
    object_id: uuid.UUID | None,
    result: AuditResult,
    description: str,
    before: dict[str, object] | None = None,
    after: dict[str, object] | None = None,
    notification_status: NotificationStatus | None = None,
) -> AdminAuditLog:
    """Stage one immutable event in the caller's current transaction."""
    if not _ACTION_PATTERN.fullmatch(action) or not _OBJECT_PATTERN.fullmatch(object_type):
        raise ValueError("Invalid audit event category")
    safe_description = " ".join(description.split()).strip()[:300]
    if not safe_description:
        raise ValueError("Audit description is required")
    event = AdminAuditLog(
        actor_user_id=context.actor_user_id,
        action=action,
        object_type=object_type,
        object_id=object_id,
        result=result,
        description=safe_description,
        before_data=_sanitize_snapshot(object_type, before or {}),
        after_data=_sanitize_snapshot(object_type, after or {}),
        notification_status=notification_status,
        correlation_id=context.correlation_id,
    )
    session.add(event)
    return event


async def record_notification_delivery(
    session: AsyncSession,
    *,
    context: AuditContext,
    user_id: uuid.UUID,
    status: NotificationStatus,
    requested: bool,
) -> None:
    descriptions = {
        "sent": "Служебное уведомление доставлено в Telegram.",
        "failed": "Служебное уведомление не доставлено в Telegram.",
        "not_requested": "Отправка служебного уведомления не запрашивалась.",
        "unavailable": "У пользователя нет доступного Telegram-канала.",
        "pending": "Служебное уведомление ожидает отправки.",
    }
    add_event(
        session,
        context=context,
        action="notification.delivery",
        object_type="user",
        object_id=user_id,
        result="failure" if status == "failed" else "success",
        description=descriptions[status],
        after=user_change_snapshot(channel="telegram", requested=requested),
        notification_status=status,
    )
    await session.commit()


def _actor_label(actor_id: uuid.UUID | None, username: str | None) -> str:
    if username:
        return f"@{username.lstrip('@')}"
    if actor_id:
        return f"Администратор {str(actor_id)[:8]}"
    return "Удалённый администратор"


async def list_events(
    session: AsyncSession,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    actor_user_id: uuid.UUID | None = None,
    action: str | None = None,
    result: AuditResult | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AdminAuditEntry], int, list[AdminAuditActor], list[str]]:
    limit = max(1, min(100, limit))
    offset = max(0, offset)
    filters = []
    if date_from is not None:
        filters.append(AdminAuditLog.created_at >= date_from)
    if date_to is not None:
        filters.append(AdminAuditLog.created_at <= date_to)
    if actor_user_id is not None:
        filters.append(AdminAuditLog.actor_user_id == actor_user_id)
    if action:
        filters.append(AdminAuditLog.action == action)
    if result:
        filters.append(AdminAuditLog.result == result)

    total = int(
        await session.scalar(select(func.count()).select_from(AdminAuditLog).where(*filters)) or 0
    )
    actor = aliased(User)
    rows = (
        await session.execute(
            select(AdminAuditLog, actor.username)
            .outerjoin(actor, actor.id == AdminAuditLog.actor_user_id)
            .where(*filters)
            .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [
        AdminAuditEntry(
            id=event.id,
            actor_user_id=event.actor_user_id,
            actor_label=_actor_label(event.actor_user_id, username),
            action=event.action,
            object_type=event.object_type,
            object_id=event.object_id,
            result=event.result,
            description=event.description,
            before=event.before_data,
            after=event.after_data,
            notification_status=event.notification_status,
            correlation_id=event.correlation_id,
            created_at=event.created_at,
        )
        for event, username in rows
    ]

    actor_rows = (
        await session.execute(
            select(AdminAuditLog.actor_user_id, actor.username)
            .outerjoin(actor, actor.id == AdminAuditLog.actor_user_id)
            .where(AdminAuditLog.actor_user_id.is_not(None))
            .distinct()
            .order_by(actor.username.asc().nullslast(), AdminAuditLog.actor_user_id.asc())
        )
    ).all()
    actors = [
        AdminAuditActor(id=actor_id, label=_actor_label(actor_id, username))
        for actor_id, username in actor_rows
        if actor_id is not None
    ]
    actions = list(
        (
            await session.scalars(
                select(AdminAuditLog.action).distinct().order_by(AdminAuditLog.action.asc())
            )
        ).all()
    )
    return items, total, actors, actions
