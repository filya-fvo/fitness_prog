"""Validation and immutable publication lifecycle for training programs."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.program import Program
from app.services import admin_audit

LEVELS = {"beginner", "intermediate", "advanced"}
LOCATIONS = {"gym", "home", "outdoor"}
SEXES = {"male", "female", "any", "unisex"}
EQUIPMENT = {"bodyweight", "bands", "dumbbells", "barbell", "machines"}
LIMITATIONS = {"no_knee", "no_spine", "shoulder_sensitive"}
WORKOUT_TYPES = {
    "full_body",
    "full_body_alt",
    "upper_lower",
    "push_pull_legs",
    "home_express",
    "strength",
    "hypertrophy",
    "mobility",
    "conditioning",
    "custom",
}


class ProgramPublicationError(ValueError):
    """A draft cannot be published without fixing its safe validation errors."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def seed_program_key(name: str) -> str:
    """Stable non-identifying key for versioned programs maintained in seed."""
    digest = hashlib.sha256(name.strip().casefold().encode("utf-8")).hexdigest()[:24]
    return f"seed-{digest}"


def seed_program_payload(row: dict[str, Any]) -> dict[str, Any]:
    """Trusted seed rows are published content, unlike admin-created drafts."""
    payload = dict(row)
    payload.update(
        publication_status="published",
        program_key=seed_program_key(str(row["name"])),
        version=1,
        is_current=True,
        published_at=datetime.now(UTC),
        published_by=None,
    )
    return payload


def mark_seed_program_published(program: Program) -> None:
    program.publication_status = "published"
    program.is_current = True
    if program.published_at is None:
        program.published_at = datetime.now(UTC)


def is_public_catalog_program(program: Program) -> bool:
    return (
        not program.is_deleted
        and program.publication_status == "published"
        and program.is_current
    )


def is_accessible_to_user(program: Program, active_program_id: object) -> bool:
    """Allow the public current version or the immutable version already in use."""
    if is_public_catalog_program(program):
        return True
    return (
        not program.is_deleted
        and program.publication_status in {"published", "archived"}
        and str(active_program_id or "") == str(program.id)
    )


def _integer(value: object, *, minimum: int, maximum: int) -> int | None:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed if minimum <= parsed <= maximum else None


def _text_list(value: object) -> list[str] | None:
    if not isinstance(value, list):
        return None
    result = [str(item).strip().lower() for item in value]
    if any(not item for item in result):
        return None
    return result


async def validate_for_publication(session: AsyncSession, program: Program) -> list[str]:
    """Return user-safe errors; one catalog query validates every exercise reference."""
    errors: list[str] = []
    structure = program.structure if isinstance(program.structure, dict) else {}
    schedule = structure.get("schedule")
    days_per_week = _integer(structure.get("days_per_week"), minimum=1, maximum=7)

    if not program.name.strip():
        errors.append("Укажите название программы.")
    structure_level = str(structure.get("level") or "").lower()
    card_level = str(program.level or program.target_level or "").lower()
    level = structure_level or card_level
    if level not in LEVELS:
        errors.append("Укажите уровень: новичок, средний или продвинутый.")
    if card_level not in LEVELS:
        errors.append("Уровень карточки программы не заполнен.")
    if structure_level and card_level and structure_level != card_level:
        errors.append("Уровень карточки не совпадает с уровнем расписания.")
    structure_type = str(structure.get("workout_type") or "").lower()
    card_type = str(program.workout_type or "").lower()
    if card_type not in WORKOUT_TYPES or structure_type not in WORKOUT_TYPES:
        errors.append("Укажите допустимый тип тренировки.")
    elif structure_type != card_type:
        errors.append("Тип карточки не совпадает с типом расписания.")
    location = str(structure.get("location") or "").lower()
    if location not in LOCATIONS:
        errors.append("Укажите место тренировки: зал, дом или улица.")

    sexes = _text_list(structure.get("sex"))
    if not sexes or any(item not in SEXES for item in sexes):
        errors.append("Укажите допустимый пол для программы.")
    equipment = _text_list(structure.get("equipment"))
    if equipment is None or any(item not in EQUIPMENT for item in equipment):
        errors.append("В программе указан неизвестный инвентарь.")
    limitations = _text_list(structure.get("limitations"))
    if limitations is None or any(item not in LIMITATIONS for item in limitations):
        errors.append("В программе указано неизвестное ограничение.")

    if not isinstance(schedule, list) or not schedule:
        errors.append("Добавьте хотя бы один тренировочный день.")
        return errors
    if days_per_week is None or days_per_week != len(schedule):
        errors.append("Количество дней в неделе должно совпадать с расписанием.")

    exercise_ids: set[uuid.UUID] = set()
    exercise_names: set[str] = set()
    day_indexes: set[int] = set()
    for position, raw_day in enumerate(schedule, start=1):
        if not isinstance(raw_day, dict):
            errors.append(f"День {position}: неверный формат.")
            continue
        day_index = _integer(raw_day.get("day_index", position), minimum=1, maximum=7)
        if day_index is None or day_index in day_indexes:
            errors.append(f"День {position}: номер должен быть уникальным от 1 до 7.")
        else:
            day_indexes.add(day_index)
        exercises = raw_day.get("exercises")
        if not isinstance(exercises, list) or not exercises:
            errors.append(f"День {position}: добавьте упражнения.")
            continue
        explicit_orders: set[int] = set()
        day_refs: set[str] = set()
        for exercise_position, raw_item in enumerate(exercises, start=1):
            prefix = f"День {position}, упражнение {exercise_position}"
            if not isinstance(raw_item, dict):
                errors.append(f"{prefix}: неверный формат.")
                continue
            if "order" in raw_item:
                order = _integer(raw_item.get("order"), minimum=1, maximum=100)
                if order is None or order in explicit_orders:
                    errors.append(f"{prefix}: порядок должен быть уникальным.")
                else:
                    explicit_orders.add(order)
            sets = _integer(raw_item.get("sets", raw_item.get("target_sets")), minimum=1, maximum=20)
            if sets is None:
                errors.append(f"{prefix}: укажите от 1 до 20 подходов.")
            reps = raw_item.get("reps", raw_item.get("target_reps"))
            if reps is None or not str(reps).strip() or len(str(reps)) > 40:
                errors.append(f"{prefix}: укажите повторения или длительность.")
            rest = _integer(raw_item.get("rest_sec"), minimum=0, maximum=600)
            if rest is None:
                errors.append(f"{prefix}: отдых должен быть от 0 до 600 секунд.")

            raw_id = raw_item.get("exercise_id")
            raw_name = str(raw_item.get("exercise_name") or "").strip()
            if raw_id:
                try:
                    exercise_id = uuid.UUID(str(raw_id))
                except ValueError:
                    errors.append(f"{prefix}: неверный идентификатор упражнения.")
                else:
                    exercise_ids.add(exercise_id)
                    ref = f"id:{exercise_id}"
                    if ref in day_refs:
                        errors.append(f"{prefix}: упражнение повторяется в одном дне.")
                    day_refs.add(ref)
            elif raw_name:
                exercise_names.add(raw_name)
                ref = f"name:{raw_name.casefold()}"
                if ref in day_refs:
                    errors.append(f"{prefix}: упражнение повторяется в одном дне.")
                day_refs.add(ref)
            else:
                errors.append(f"{prefix}: выберите упражнение из каталога.")

    if day_indexes and day_indexes != set(range(1, len(schedule) + 1)):
        errors.append("Номера тренировочных дней должны идти подряд, начиная с 1.")

    rows = list(
        (
            await session.scalars(
                select(Exercise).where(
                    Exercise.is_deleted.is_(False),
                    (Exercise.id.in_(exercise_ids) | Exercise.name_ru.in_(exercise_names)),
                )
            )
        ).all()
    ) if exercise_ids or exercise_names else []
    found_ids = {item.id for item in rows}
    found_names = {item.name_ru for item in rows}
    missing_ids = exercise_ids - found_ids
    missing_names = exercise_names - found_names
    if missing_ids or missing_names:
        errors.append(
            "Некоторые упражнения не найдены или находятся в архиве: "
            + ", ".join([*(str(item) for item in sorted(missing_ids, key=str)), *sorted(missing_names)])[:500]
        )
    return errors


async def create_draft_version(session: AsyncSession, source: Program) -> Program:
    next_version = int(
        await session.scalar(
            select(func.max(Program.version)).where(Program.program_key == source.program_key)
        )
        or source.version
    ) + 1
    draft = Program(
        name=source.name,
        description=source.description,
        target_level=source.target_level,
        duration_weeks=source.duration_weeks,
        structure=dict(source.structure or {}),
        workout_type=source.workout_type,
        level=source.level,
        is_template=source.is_template,
        publication_status="draft",
        program_key=source.program_key,
        version=next_version,
        is_current=False,
    )
    session.add(draft)
    await session.flush()
    return draft


async def publish(
    session: AsyncSession,
    program: Program,
    *,
    audit_context: admin_audit.AuditContext,
) -> Program:
    errors = await validate_for_publication(session, program)
    if errors:
        raise ProgramPublicationError(errors)
    before = admin_audit.program_snapshot(program)
    await session.execute(
        update(Program)
        .where(
            Program.program_key == program.program_key,
            Program.id != program.id,
            Program.is_current.is_(True),
        )
        .values(is_current=False)
        .execution_options(synchronize_session="fetch")
    )
    await session.flush()
    program.publication_status = "published"
    program.is_current = True
    program.published_at = datetime.now(UTC)
    program.published_by = audit_context.actor_user_id
    admin_audit.add_event(
        session,
        context=audit_context,
        action="program.publish",
        object_type="program",
        object_id=program.id,
        result="success",
        description="Версия программы опубликована.",
        before=before,
        after=admin_audit.program_snapshot(program),
    )
    await session.commit()
    await session.refresh(program)
    return program


async def rollback(
    session: AsyncSession,
    current: Program,
    *,
    audit_context: admin_audit.AuditContext,
) -> Program:
    previous = await session.scalar(
        select(Program)
        .where(
            Program.program_key == current.program_key,
            Program.publication_status == "published",
            Program.is_deleted.is_(False),
            Program.version < current.version,
        )
        .order_by(Program.version.desc())
    )
    if previous is None:
        raise ProgramPublicationError(["Предыдущая опубликованная версия не найдена."])
    current.is_current = False
    await session.flush()
    previous.is_current = True
    admin_audit.add_event(
        session,
        context=audit_context,
        action="program.rollback",
        object_type="program",
        object_id=previous.id,
        result="success",
        description="Восстановлена предыдущая версия программы.",
        before=admin_audit.program_snapshot(current),
        after=admin_audit.program_snapshot(previous),
    )
    await session.commit()
    await session.refresh(previous)
    return previous
