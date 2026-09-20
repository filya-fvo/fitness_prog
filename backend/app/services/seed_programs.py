"""Version-preserving synchronization of the maintained program seed."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.program import Program
from app.services import program_publication

CONTENT_FIELDS = (
    "name",
    "description",
    "target_level",
    "duration_weeks",
    "structure",
    "workout_type",
    "level",
    "is_template",
)

PROGRAM_RENAMES = {
    "М · Зал · Новичок · Тренажёры FB": "М · Зал · Новичок · Тренажёры · Всё тело",
    "М · Зал · Новичок · PPL intro": "М · Зал · Новичок · Жим/тяга/ноги · Введение",
    "М · Зал · Новичок · Гантели FB": "М · Зал · Новичок · Гантели · Всё тело",
    "Ж · Зал · Новичок · Тренажёры FB": "Ж · Зал · Новичок · Тренажёры · Всё тело",
    "М · Зал · Опытный · PPL 3 дня": "М · Зал · Опытный · Жим/тяга/ноги · 3 дня",
    "Ж · Зал · Опытный · Glute focus 3 дня": "Ж · Зал · Опытный · Акцент на ягодицы · 3 дня",
    "М · Зал · Продвинутый · PPL 6 дней": "М · Зал · Продвинутый · Жим/тяга/ноги · 6 дней",
    "М · Дом · Продвинутый · Гантели dense": "М · Дом · Продвинутый · Гантели · Плотный формат",
    "Ж · Дом · Продвинутый · Резинки dense": "Ж · Дом · Продвинутый · Резинки · Плотный формат",
    "М · Дом · Без нагрузки на колени · Свой вес": "М · Дом · Без нагрузки на колени · Свой вес + резинки",
    "Ж · Дом · Без нагрузки на колени · Свой вес": "Ж · Дом · Без нагрузки на колени · Свой вес + резинки",
}


@dataclass(frozen=True)
class SeedProgramSyncStats:
    created: int = 0
    unchanged: int = 0
    versioned: int = 0
    retired: int = 0


def seed_content_matches(program: Program, row: Mapping[str, Any]) -> bool:
    """Compare only public program content, excluding lifecycle metadata."""
    return all(getattr(program, field) == row.get(field) for field in CONTENT_FIELDS)


async def sync_seed_programs(
    session: AsyncSession,
    rows: Sequence[dict[str, Any]],
    *,
    renames: Mapping[str, str] | None = None,
) -> SeedProgramSyncStats:
    """Publish changed seed rows as new immutable versions and retire removed rows."""
    existing = list((await session.scalars(select(Program))).all())
    current_by_name = {
        item.name: item
        for item in existing
        if item.is_current and not item.is_deleted
    }
    max_version_by_key: dict[str, int] = {}
    for item in existing:
        max_version_by_key[item.program_key] = max(
            max_version_by_key.get(item.program_key, 0),
            item.version,
        )

    effective_renames = PROGRAM_RENAMES if renames is None else renames
    previous_name_by_current = {
        current_name: previous_name
        for previous_name, current_name in effective_renames.items()
    }
    keep_names = {str(row["name"]) for row in rows}
    created = unchanged = versioned = 0

    for row in rows:
        name = str(row["name"])
        current = current_by_name.get(name)
        if current is None:
            previous_name = previous_name_by_current.get(name)
            if previous_name:
                current = current_by_name.get(previous_name)

        if current is None:
            new_program = Program(**program_publication.seed_program_payload(row))
            session.add(new_program)
            current_by_name[name] = new_program
            max_version_by_key[new_program.program_key] = new_program.version
            created += 1
            continue

        if seed_content_matches(current, row):
            current.is_deleted = False
            program_publication.mark_seed_program_published(current)
            unchanged += 1
            continue

        current.is_current = False
        await session.flush()
        next_version = max_version_by_key.get(current.program_key, current.version) + 1
        new_program = Program(
            **program_publication.seed_program_payload(
                row,
                program_key=current.program_key,
                version=next_version,
            )
        )
        session.add(new_program)
        current_by_name[name] = new_program
        max_version_by_key[current.program_key] = next_version
        versioned += 1

    retired = 0
    for item in existing:
        if item.name in keep_names or item.is_deleted or not item.is_template or not item.is_current:
            continue
        item.is_current = False
        item.is_deleted = True
        retired += 1

    await session.flush()
    return SeedProgramSyncStats(
        created=created,
        unchanged=unchanged,
        versioned=versioned,
        retired=retired,
    )
