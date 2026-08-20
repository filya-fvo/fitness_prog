"""Apply accepted i18n: resistance band -> резинка; Gym visual credit casing in seed."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise

SEED = Path(__file__).resolve().parent / "seed_content" / "exercises.json"


def patch_seed() -> None:
    rows = json.loads(SEED.read_text(encoding="utf-8"))
    eq = 0
    credit = 0
    for row in rows:
        if row.get("equipment") == "resistance band":
            row["equipment"] = "резинка"
            eq += 1
        for key in ("description",):
            val = row.get(key)
            if isinstance(val, str) and "Gym visual" in val:
                row[key] = val.replace("Gym visual", "Gym Visual")
                credit += 1
        tags = row.get("tags")
        if isinstance(tags, list):
            new_tags = []
            changed = False
            for t in tags:
                if t == "© Gym visual":
                    new_tags.append("© Gym Visual")
                    changed = True
                else:
                    new_tags.append(t)
            if changed:
                row["tags"] = new_tags
                credit += 1
    SEED.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"seed equipment_fixed={eq} credit_fixed_ops={credit} total={len(rows)}")


async def patch_db() -> None:
    async with AsyncSessionLocal() as session:
        items = list(
            (
                await session.scalars(
                    select(Exercise).where(Exercise.equipment == "resistance band")
                )
            ).all()
        )
        for it in items:
            it.equipment = "резинка"
            print(f"db equipment: {it.name_ru}")
        # optional credit in description
        all_items = list((await session.scalars(select(Exercise))).all())
        desc_n = 0
        for it in all_items:
            if it.description and "Gym visual" in it.description:
                it.description = it.description.replace("Gym visual", "Gym Visual")
                desc_n += 1
            if isinstance(it.tags, list) and "© Gym visual" in it.tags:
                it.tags = ["© Gym Visual" if t == "© Gym visual" else t for t in it.tags]
                desc_n += 1
        await session.commit()
        print(f"db equipment_rows={len(items)} credit_rows_touched~={desc_n}")


def main() -> None:
    patch_seed()
    asyncio.run(patch_db())


if __name__ == "__main__":
    main()
