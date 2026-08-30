"""Append-only administrator audit journal and safe snapshots."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_broadcast import AdminBroadcast
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
    "secondary_muscle_groups",
    "equipment",
    "difficulty",
    "media_source",
    "weight_rule",
    "tags",
    "is_deleted",
}
_EXERCISE_IMPORT_FIELDS = {"imported_count", "source"}
_SUPPORT_TICKET_FIELDS = {"status", "category", "delivery"}
_PROGRAM_FIELDS = {
    "name",
    "workout_type",
    "level",
    "target_level",
    "duration_weeks",
    "is_template",
    "publication_status",
    "program_key",
    "version",
    "is_current",
    "days_count",
    "is_deleted",
}
_BROADCAST_FIELDS = {
    "audience",
    "expected",
    "pending",
    "sent",
    "failed",
    "skipped",
    "cancelled",
    "status",
    "scheduled",
    "timezone",
}
_AUDIT_EXPORT_FIELDS = {"format", "exported_count", "total_matches", "truncated"}
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
    secondary = (
        exercise.secondary_muscle_groups
        if isinstance(exercise.secondary_muscle_groups, list)
        else []
    )
    return {
        "name": _short_text(exercise.name_ru),
        "muscle_group": _short_text(exercise.muscle_group, limit=60),
        "secondary_muscle_groups": [
            _short_text(value, limit=40)
            for value in secondary[:12]
            if _short_text(value, limit=40)
        ],
        "equipment": _short_text(exercise.equipment, limit=60),
        "difficulty": int(exercise.difficulty),
        "media_source": _short_text(exercise.media_source, limit=40),
        "weight_rule": _short_text(exercise.weight_rule, limit=20),
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
        "publication_status": _short_text(program.publication_status, limit=20),
        "program_key": _short_text(program.program_key, limit=100),
        "version": int(program.version),
        "is_current": bool(program.is_current),
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
        "exercise_import": _EXERCISE_IMPORT_FIELDS,
        "support_ticket": _SUPPORT_TICKET_FIELDS,
        "program": _PROGRAM_FIELDS,
        "broadcast": _BROADCAST_FIELDS,
        "audit_export": _AUDIT_EXPORT_FIELDS,
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
    channel: str = "telegram",
) -> None:
    channel_labels = {
        "telegram": "Telegram",
        "web_push": "Web Push",
        "email": "email",
    }
    channel_label = channel_labels.get(channel, "выбранный канал")
    descriptions = {
        "sent": f"Служебное уведомление доставлено через {channel_label}.",
        "failed": f"Служебное уведомление не доставлено через {channel_label}.",
        "not_requested": "Отправка служебного уведомления не запрашивалась.",
        "unavailable": f"У пользователя нет доступного канала {channel_label}.",
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
        after=user_change_snapshot(channel=channel, requested=requested),
        notification_status=status,
    )
    await session.commit()


def _actor_label(actor_id: uuid.UUID | None, username: str | None) -> str:
    if username:
        return f"@{username.lstrip('@')}"
    if actor_id:
        return f"Администратор {str(actor_id)[:8]}"
    return "Удалённый администратор"


def _search_patterns(query: str) -> tuple[str, str]:
    term = query.strip()
    return f"%{term}%", f"%{term.lstrip('@')}%"


async def list_events(
    session: AsyncSession,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    actor_user_id: uuid.UUID | None = None,
    query: str | None = None,
    action: str | None = None,
    result: AuditResult | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AdminAuditEntry], int, list[AdminAuditActor], list[str]]:
    items, total = await query_event_page(
        session,
        date_from=date_from,
        date_to=date_to,
        actor_user_id=actor_user_id,
        query=query,
        action=action,
        result=result,
        limit=limit,
        offset=offset,
        max_limit=100,
    )
    actor = aliased(User)
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


async def query_event_page(
    session: AsyncSession,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    actor_user_id: uuid.UUID | None = None,
    query: str | None = None,
    action: str | None = None,
    result: AuditResult | None = None,
    limit: int,
    offset: int = 0,
    max_limit: int = 100,
) -> tuple[list[AdminAuditEntry], int]:
    """Return one newest-first page using a caller-owned fixed upper bound."""
    limit = max(1, min(max_limit, limit))
    offset = max(0, offset)
    actor = aliased(User)
    subject_user = aliased(User)
    joins = (
        (actor, actor.id == AdminAuditLog.actor_user_id),
        (
            subject_user,
            and_(AdminAuditLog.object_type == "user", subject_user.id == AdminAuditLog.object_id),
        ),
        (
            Exercise,
            and_(AdminAuditLog.object_type == "exercise", Exercise.id == AdminAuditLog.object_id),
        ),
        (
            Program,
            and_(AdminAuditLog.object_type == "program", Program.id == AdminAuditLog.object_id),
        ),
        (
            AdminBroadcast,
            and_(
                AdminAuditLog.object_type == "broadcast",
                AdminBroadcast.id == AdminAuditLog.object_id,
            ),
        ),
    )
    filters = []
    if date_from is not None:
        filters.append(AdminAuditLog.created_at >= date_from)
    if date_to is not None:
        filters.append(AdminAuditLog.created_at <= date_to)
    if actor_user_id is not None:
        filters.append(AdminAuditLog.actor_user_id == actor_user_id)
    searching = bool(query and query.strip())
    if searching:
        like, username_like = _search_patterns(query or "")
        filters.append(
            or_(
                cast(AdminAuditLog.object_id, String).ilike(like),
                cast(AdminAuditLog.correlation_id, String).ilike(like),
                AdminAuditLog.object_type.ilike(like),
                AdminAuditLog.action.ilike(like),
                AdminAuditLog.description.ilike(like),
                actor.username.ilike(username_like),
                subject_user.username.ilike(username_like),
                subject_user.auth_email.ilike(like),
                cast(subject_user.telegram_id, String).ilike(like),
                Exercise.name_ru.ilike(like),
                Program.name.ilike(like),
                AdminBroadcast.title.ilike(like),
            )
        )
    if action:
        filters.append(AdminAuditLog.action == action)
    if result:
        filters.append(AdminAuditLog.result == result)

    count_statement = select(func.count()).select_from(AdminAuditLog)
    if searching:
        for entity, condition in joins:
            count_statement = count_statement.outerjoin(entity, condition)
    total = int(await session.scalar(count_statement.where(*filters)) or 0)
    items_statement = select(
        AdminAuditLog,
        actor.username,
        subject_user.username,
        Exercise.name_ru,
        Program.name,
        AdminBroadcast.title,
    )
    for entity, condition in joins:
        items_statement = items_statement.outerjoin(entity, condition)
    rows = (
        await session.execute(
            items_statement.where(*filters)
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
            object_label=(
                (f"@{subject_username.lstrip('@')}" if subject_username else None)
                or exercise_name
                or program_name
                or broadcast_title
                or (f"{event.object_type} {str(event.object_id)[:8]}" if event.object_id else None)
            ),
            result=event.result,
            description=event.description,
            before=event.before_data,
            after=event.after_data,
            notification_status=event.notification_status,
            correlation_id=event.correlation_id,
            created_at=event.created_at,
        )
        for event, username, subject_username, exercise_name, program_name, broadcast_title in rows
    ]

    return items, total
