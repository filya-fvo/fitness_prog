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

CONTENT = Path(__file__).resolve().parent / "seed_content"


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
    existing = {
        item.name: item
        for item in (
            await session.scalars(select(Program).where(Program.is_deleted.is_(False)))
        ).all()
    }
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
        updated += 1

    retired = 0
    for name, item in existing.items():
        if name in keep_names:
            continue
        if not item.is_template:
            continue
        item.is_deleted = True
        retired += 1
    await session.flush()
    return created, updated, retired


async def main() -> None:
    if not (CONTENT / "exercises.json").exists() or not (CONTENT / "programs.json").exists():
        raise SystemExit("Run scripts/build_programs_v2.py (or generate_seed_content.py) first")

    async with AsyncSessionLocal() as session:
        ex_c, ex_u = await upsert_exercises(session)
        pr_c, pr_u, pr_r = await upsert_programs(session)
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
            f"programs_total={pr_total}"
        )


if __name__ == "__main__":
    asyncio.run(main())
