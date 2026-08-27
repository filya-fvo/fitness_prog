"""Transactional merge of a browser/email account into a Telegram account."""

from __future__ import annotations

import uuid
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.ai_conversation import AIConversation
from app.models.body_measurement import BodyMeasurement
from app.models.daily_metric import DailyMetric
from app.models.email_otp import EmailOtpCode
from app.models.nutrition import NutritionLog
from app.models.supplement_intake import SupplementIntake, WebPushSubscription
from app.models.user import User
from app.models.workout import Workout

MergePreference = Literal["email", "telegram"]


@dataclass(slots=True)
class MergeResult:
    user: User
    merged_from_user_ids: list[uuid.UUID]
    preference: MergePreference


def _present(value: Any) -> bool:
    return value is not None and value != "" and value != {} and value != []


def merge_values(preferred: Any, other: Any) -> Any:
    """Merge without discarding unique dict/list data; preferred wins scalar conflicts."""
    if isinstance(preferred, dict) and isinstance(other, dict):
        result = deepcopy(other)
        for key, value in preferred.items():
            result[key] = merge_values(value, result[key]) if key in result else deepcopy(value)
        return result
    if isinstance(preferred, list) and isinstance(other, list):
        result = deepcopy(preferred)
        for item in other:
            if item not in result:
                result.append(deepcopy(item))
        return result
    return deepcopy(preferred if _present(preferred) else other)


def profile_conflicts(email_user: User, telegram_user: User) -> list[str]:
    conflicts: list[str] = []
    for label, left, right in (
        ("Данные тела и замеры", email_user.anthropometry or {}, telegram_user.anthropometry or {}),
        ("Цели, программа и настройки", email_user.goals or {}, telegram_user.goals or {}),
    ):
        if any(
            key in right and _present(value) and _present(right[key]) and value != right[key]
            for key, value in left.items()
        ):
            conflicts.append(label)
    if email_user.subscription_status != telegram_user.subscription_status:
        conflicts.append("Статус подписки")
    return conflicts


async def _counts(session: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    async def count(model, *where) -> int:
        value = await session.scalar(select(func.count()).select_from(model).where(*where))
        return int(value or 0)

    return {
        "workouts": await count(Workout, Workout.user_id == user_id, Workout.is_deleted.is_(False)),
        "nutrition": await count(
            NutritionLog, NutritionLog.user_id == user_id, NutritionLog.is_deleted.is_(False)
        ),
        "daily_metrics": await count(
            DailyMetric, DailyMetric.user_id == user_id, DailyMetric.is_deleted.is_(False)
        ),
        "body_measurements": await count(
            BodyMeasurement,
            BodyMeasurement.user_id == user_id,
            BodyMeasurement.is_deleted.is_(False),
        ),
        "ai_messages": await count(
            AIConversation, AIConversation.user_id == user_id, AIConversation.is_deleted.is_(False)
        ),
        "supplements": await count(
            SupplementIntake,
            SupplementIntake.user_id == user_id,
            SupplementIntake.is_deleted.is_(False),
        ),
    }


async def merge_preview(
    session: AsyncSession,
    *,
    email_user: User,
    telegram_user: User,
) -> dict[str, Any]:
    return {
        "conflicts": profile_conflicts(email_user, telegram_user),
        "email": {
            "email": email_user.auth_email,
            "onboarding_completed": bool((email_user.goals or {}).get("onboarding_completed")),
            "counts": await _counts(session, email_user.id),
        },
        "telegram": {
            "username": telegram_user.username,
            "onboarding_completed": bool((telegram_user.goals or {}).get("onboarding_completed")),
            "counts": await _counts(session, telegram_user.id),
        },
    }


def _choose(preference: MergePreference, email_value: Any, telegram_value: Any) -> Any:
    return (
        merge_values(email_value, telegram_value)
        if preference == "email"
        else merge_values(telegram_value, email_value)
    )


async def _merge_daily_metrics(
    session: AsyncSession,
    *,
    email_user_id: uuid.UUID,
    telegram_user_id: uuid.UUID,
    preference: MergePreference,
) -> None:
    target_rows = list(
        (
            await session.scalars(
                select(DailyMetric).where(DailyMetric.user_id == telegram_user_id)
            )
        ).all()
    )
    source_rows = list(
        (
            await session.scalars(select(DailyMetric).where(DailyMetric.user_id == email_user_id))
        ).all()
    )
    target_by_date = {row.date: row for row in target_rows}
    fields = ("sleep_minutes", "steps", "active_minutes")
    for source_row in source_rows:
        target_row = target_by_date.get(source_row.date)
        if target_row is None:
            source_row.user_id = telegram_user_id
            continue
        source_meta = dict(source_row.sources or {})
        target_meta = dict(target_row.sources or {})
        for field in fields:
            source_value = getattr(source_row, field)
            target_value = getattr(target_row, field)
            use_source = source_value is not None and (
                preference == "email" or target_value is None
            )
            if use_source:
                setattr(target_row, field, source_value)
                if field in source_meta:
                    target_meta[field] = source_meta[field]
        target_row.sources = target_meta
        await session.delete(source_row)


async def _merge_body_measurements(
    session: AsyncSession,
    *,
    email_user_id: uuid.UUID,
    telegram_user_id: uuid.UUID,
    preference: MergePreference,
) -> None:
    target_rows = list(
        (
            await session.scalars(
                select(BodyMeasurement).where(BodyMeasurement.user_id == telegram_user_id)
            )
        ).all()
    )
    source_rows = list(
        (
            await session.scalars(
                select(BodyMeasurement).where(BodyMeasurement.user_id == email_user_id)
            )
        ).all()
    )
    target_by_date = {row.date: row for row in target_rows}
    fields = (
        "weight_kg",
        "neck_cm",
        "shoulders_cm",
        "chest_cm",
        "waist_cm",
        "hips_cm",
        "bicep_cm",
        "thigh_cm",
        "calf_cm",
        "note",
    )
    for source_row in source_rows:
        target_row = target_by_date.get(source_row.date)
        if target_row is None:
            source_row.user_id = telegram_user_id
            continue
        source_meta = dict(source_row.sources or {})
        target_meta = dict(target_row.sources or {})
        for field in fields:
            source_value = getattr(source_row, field)
            target_value = getattr(target_row, field)
            use_source = source_value is not None and (
                preference == "email" or target_value is None
            )
            if use_source:
                setattr(target_row, field, source_value)
                if field in source_meta:
                    target_meta[field] = source_meta[field]
        target_row.sources = target_meta
        await session.delete(source_row)


async def _merge_workouts(
    session: AsyncSession,
    *,
    email_user_id: uuid.UUID,
    telegram_user_id: uuid.UUID,
    preference: MergePreference,
) -> None:
    target_rows = list(
        (await session.scalars(select(Workout).where(Workout.user_id == telegram_user_id))).all()
    )
    source_rows = list(
        (await session.scalars(select(Workout).where(Workout.user_id == email_user_id))).all()
    )
    target_by_client = {row.client_workout_id: row for row in target_rows if row.client_workout_id}
    scalar_fields = (
        "program_id",
        "scheduled_date",
        "status",
        "ai_notes",
        "rpe",
        "started_at",
        "completed_at",
        "title",
        "workout_type",
        "duration_sec",
    )
    for source in source_rows:
        target = (
            target_by_client.get(source.client_workout_id) if source.client_workout_id else None
        )
        if target is None:
            source.user_id = telegram_user_id
            continue

        for field in scalar_fields:
            setattr(
                target, field, _choose(preference, getattr(source, field), getattr(target, field))
            )
        target.plan = _choose(preference, source.plan or {}, target.plan or {})
        target.is_deleted = bool(source.is_deleted and target.is_deleted)
        flag_modified(target, "plan")

        target_sets = {(row.exercise_id, row.set_number): row for row in target.sets}
        for source_set in source.sets:
            target_set = target_sets.get((source_set.exercise_id, source_set.set_number))
            if target_set is None:
                source_set.workout = target
                continue
            for field in (
                "reps",
                "weight",
                "weight_mode",
                "rest_time_sec",
                "duration_sec",
                "note",
                "machine_params",
            ):
                setattr(
                    target_set,
                    field,
                    _choose(preference, getattr(source_set, field), getattr(target_set, field)),
                )
            target_set.is_completed = bool(source_set.is_completed or target_set.is_completed)
            target_set.is_deleted = bool(source_set.is_deleted and target_set.is_deleted)
        source.is_deleted = True


async def _merge_supplements(
    session: AsyncSession,
    *,
    email_user_id: uuid.UUID,
    telegram_user_id: uuid.UUID,
    preference: MergePreference,
) -> None:
    target_rows = list(
        (
            await session.scalars(
                select(SupplementIntake).where(SupplementIntake.user_id == telegram_user_id)
            )
        ).all()
    )
    target_by_slot = {(row.supplement_entry_id, row.scheduled_at): row for row in target_rows}
    source_rows = list(
        (
            await session.scalars(
                select(SupplementIntake).where(SupplementIntake.user_id == email_user_id)
            )
        ).all()
    )
    for source in source_rows:
        target = target_by_slot.get((source.supplement_entry_id, source.scheduled_at))
        if target is None:
            source.user_id = telegram_user_id
            continue
        for field in (
            "supplement_key",
            "name_ru",
            "dose",
            "slot",
            "days_mode",
            "completed_at",
            "snoozed_until",
            "notified_at",
            "source",
        ):
            setattr(
                target, field, _choose(preference, getattr(source, field), getattr(target, field))
            )
        status_rank = {"pending": 0, "skipped": 1, "taken": 2}
        target.status = max(
            (source.status, target.status), key=lambda value: status_rank.get(value, 0)
        )
        target.is_deleted = bool(source.is_deleted and target.is_deleted)
        source.is_deleted = True


async def merge_accounts(
    session: AsyncSession,
    *,
    email_user: User,
    telegram_user: User,
    preference: MergePreference,
) -> MergeResult:
    """Merge all owned rows into telegram_user and soft-delete the email-only duplicate."""
    if email_user.id == telegram_user.id:
        return MergeResult(telegram_user, [], preference)
    if telegram_user.telegram_id is None or email_user.telegram_id is not None:
        raise ValueError(
            "Only an email-only account can be merged into the current Telegram account"
        )

    locked = list(
        (
            await session.scalars(
                select(User)
                .where(User.id.in_([email_user.id, telegram_user.id]))
                .order_by(User.id)
                .with_for_update()
            )
        ).all()
    )
    by_id = {row.id: row for row in locked}
    source = by_id[email_user.id]
    target = by_id[telegram_user.id]
    if source.is_deleted or target.is_deleted:
        raise ValueError("Account was already merged or deleted")

    await _merge_workouts(
        session,
        email_user_id=source.id,
        telegram_user_id=target.id,
        preference=preference,
    )
    await _merge_supplements(
        session,
        email_user_id=source.id,
        telegram_user_id=target.id,
        preference=preference,
    )
    await _merge_daily_metrics(
        session,
        email_user_id=source.id,
        telegram_user_id=target.id,
        preference=preference,
    )
    await _merge_body_measurements(
        session,
        email_user_id=source.id,
        telegram_user_id=target.id,
        preference=preference,
    )
    for model in (NutritionLog, AIConversation, WebPushSubscription, EmailOtpCode):
        await session.execute(
            update(model).where(model.user_id == source.id).values(user_id=target.id)
        )

    target.anthropometry = _choose(
        preference, source.anthropometry or {}, target.anthropometry or {}
    )
    merged_goals = _choose(preference, source.goals or {}, target.goals or {})
    previous_ids = list(merged_goals.get("_merged_from_user_ids") or [])
    source_id = str(source.id)
    if source_id not in previous_ids:
        previous_ids.append(source_id)
    merged_goals["_merged_from_user_ids"] = previous_ids
    merged_goals["_last_merge_preference"] = preference
    merged_goals["onboarding_completed"] = bool(
        (source.goals or {}).get("onboarding_completed")
        or (target.goals or {}).get("onboarding_completed")
    )
    target.goals = merged_goals
    flag_modified(target, "anthropometry")
    flag_modified(target, "goals")

    source_email = source.auth_email
    target.subscription_status = (
        "pro_stars"
        if "pro_stars" in {source.subscription_status, target.subscription_status}
        else target.subscription_status
    )
    target.stars_balance = int(target.stars_balance or 0) + int(source.stars_balance or 0)
    source.auth_email = None
    source.telegram_id = None
    source.merged_into_user_id = target.id
    source.is_deleted = True

    # Release unique email/provider ids before assigning them to the survivor.
    await session.flush()
    target.auth_email = source_email

    await session.commit()
    await session.refresh(target)
    return MergeResult(target, [source.id], preference)
