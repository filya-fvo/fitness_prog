"""Idempotent seed: 100 exercises + template programs (P0)."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User

CONTENT = Path(__file__).resolve().parent / "seed_content"

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
}


def _load_exercise_renames() -> dict[str, str]:
    path = CONTENT / "exercise_renames.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {str(k): str(v) for k, v in raw.items() if str(k) and str(v) and str(k) != str(v)}


async def upsert_exercises(session) -> tuple[int, int]:
    payload = json.loads((CONTENT / "exercises.json").read_text(encoding="utf-8"))
    renames = _load_exercise_renames()
    existing_items = list(
        (
            await session.scalars(select(Exercise).where(Exercise.is_deleted.is_(False)))
        ).all()
    )
    existing = {item.name_ru: item for item in existing_items}

    # Rename existing rows first so programs keep the same exercise UUIDs.
    renamed = 0
    for old_name, new_name in renames.items():
        item = existing.get(old_name)
        if item is None or old_name == new_name:
            continue
        target = existing.get(new_name)
        if target is not None and target.id != item.id:
            # Prefer keeping the already-correct Russian row; retire the old name.
            item.is_deleted = True
            renamed += 1
            continue
        item.name_ru = new_name
        existing.pop(old_name, None)
        existing[new_name] = item
        renamed += 1

    created = 0
    updated = 0
    for row in payload:
        current = existing.get(row["name_ru"])
        if current is None:
            session.add(Exercise(**row))
            created += 1
            continue
        for key, value in row.items():
            setattr(current, key, value)
        updated += 1
    await session.flush()
    if renamed:
        print(f"exercises_renamed_in_db={renamed}")
    return created, updated


async def upsert_programs(session) -> tuple[int, int, int]:
    """Upsert by name; soft-delete old templates not present in the new payload."""
    payload = json.loads((CONTENT / "programs.json").read_text(encoding="utf-8"))
    keep_names = {str(row["name"]) for row in payload}
    existing: dict[str, Program] = {}
    for item in (await session.scalars(select(Program))).all():
        current = existing.get(item.name)
        if current is None or (current.is_deleted and not item.is_deleted):
            existing[item.name] = item
    created = 0
    updated = 0
    for row in payload:
        current = existing.get(row["name"])
        if current is None:
            session.add(Program(**row))
            created += 1
            continue
        for key, value in row.items():
            setattr(current, key, value)
        current.is_deleted = False
        updated += 1

    retired = 0
    for name, item in existing.items():
        if name in keep_names:
            continue
        if item.is_deleted or not item.is_template:
            continue
        item.is_deleted = True
        retired += 1
    await session.flush()
    return created, updated, retired


async def migrate_renamed_program_references(session) -> int:
    """Move profile pointers from archived renamed templates to their active replacements."""
    names = set(PROGRAM_RENAMES) | set(PROGRAM_RENAMES.values())
    rows = list((await session.scalars(select(Program).where(Program.name.in_(names)))).all())
    by_name = {item.name: item for item in rows}
    id_map = {
        str(by_name[old_name].id): str(by_name[new_name].id)
        for old_name, new_name in PROGRAM_RENAMES.items()
        if old_name in by_name
        and new_name in by_name
        and by_name[old_name].id != by_name[new_name].id
    }
    if not id_map:
        return 0

    migrated = 0
    users = list((await session.scalars(select(User))).all())
    for user in users:
        goals = dict(user.goals or {})
        changed = False
        for field in ("active_program_id", "recommended_program_id"):
            current_id = str(goals.get(field) or "")
            replacement_id = id_map.get(current_id)
            if replacement_id:
                goals[field] = replacement_id
                changed = True
        if changed:
            user.goals = goals
            migrated += 1
    await session.flush()
    return migrated


async def main() -> None:
    if not (CONTENT / "exercises.json").exists() or not (CONTENT / "programs.json").exists():
        raise SystemExit("Run scripts/build_programs_v2.py (or generate_seed_content.py) first")

    async with AsyncSessionLocal() as session:
        ex_c, ex_u = await upsert_exercises(session)
        pr_c, pr_u, pr_r = await upsert_programs(session)
        pr_refs = await migrate_renamed_program_references(session)
        await session.commit()

        ex_total = await session.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.is_deleted.is_(False))
        )
        pr_total = await session.scalar(
            select(func.count()).select_from(Program).where(Program.is_deleted.is_(False))
        )
        print(
            f"SEED_OK exercises_created={ex_c} exercises_updated={ex_u} exercises_total={ex_total} "
            f"programs_created={pr_c} programs_updated={pr_u} programs_retired={pr_r} "
            f"programs_total={pr_total} program_profile_refs_migrated={pr_refs}"
        )


if __name__ == "__main__":
    asyncio.run(main())
