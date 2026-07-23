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


async def upsert_exercises(session) -> tuple[int, int]:
    payload = json.loads((CONTENT / "exercises.json").read_text(encoding="utf-8"))
    existing = {
        item.name_ru: item
        for item in (
            await session.scalars(select(Exercise).where(Exercise.is_deleted.is_(False)))
        ).all()
    }
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
    return created, updated


async def upsert_programs(session) -> tuple[int, int]:
    payload = json.loads((CONTENT / "programs.json").read_text(encoding="utf-8"))
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
    await session.flush()
    return created, updated


async def main() -> None:
    if not (CONTENT / "exercises.json").exists() or not (CONTENT / "programs.json").exists():
        raise SystemExit("Run scripts/generate_seed_content.py first")

    async with AsyncSessionLocal() as session:
        ex_c, ex_u = await upsert_exercises(session)
        pr_c, pr_u = await upsert_programs(session)
        await session.commit()

        ex_total = await session.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.is_deleted.is_(False))
        )
        pr_total = await session.scalar(
            select(func.count()).select_from(Program).where(Program.is_deleted.is_(False))
        )
        print(
            f"SEED_OK exercises_created={ex_c} exercises_updated={ex_u} exercises_total={ex_total} "
            f"programs_created={pr_c} programs_updated={pr_u} programs_total={pr_total}"
        )


if __name__ == "__main__":
    asyncio.run(main())
