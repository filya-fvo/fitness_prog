"""Keep one cable pullover: «Пуловер в блоке на спину». Soft-delete duplicates."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import or_, select

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise

SEED = Path(__file__).resolve().parent / "seed_content" / "exercises.json"

CANONICAL = "Пуловер в блоке на спину"
DROP_FROM_SEED = {
    "Пуловер в блоке",
    "Тяга верхнего блока прямыми руками",
}
# Soft-delete these exact names in DB (duplicates of the same movement).
SOFT_DELETE_NAMES = {
    "Пуловер в блоке",
    "Тяга верхнего блока прямыми руками",
}


def patch_seed() -> None:
    rows = json.loads(SEED.read_text(encoding="utf-8"))
    kept: list[dict] = []
    removed: list[str] = []
    for row in rows:
        name = str(row.get("name_ru") or "")
        if name in DROP_FROM_SEED:
            removed.append(name)
            continue
        if name == CANONICAL:
            # Ensure muscle/equipment/description match the intended movement.
            row["muscle_group"] = "спина"
            row["equipment"] = "блок/кроссовер"
            row["description"] = (
                "Пуловер в блоке на спину (straight-arm pulldown / cable pullover). "
                "Цель: широчайшие. Оборудование: блок/кроссовер."
            )
            row["technique"] = (
                "1. Встаньте лицом к верхнему блоку, возьмите прямую рукоять или канат.\n"
                "2. Сделайте шаг назад, слегка наклонитесь вперёд, руки почти прямые.\n"
                "3. Тяните рукоять дугой вниз к бёдрам, ощущая работу широчайших.\n"
                "4. Контролируемо вернитесь вверх, не превращая движение в тягу к груди.\n"
                "5. Держите корпус стабильным, локти почти не сгибайте."
            )
            row["common_mistakes"] = (
                "Сгибание локтей как в тяге; работа бицепсом; сильный прогиб поясницы; рывки."
            )
            tags = list(row.get("tags") or [])
            for t in ("curated", "manual_add", "replacement", "cable", "pullover", "спина"):
                if t not in tags:
                    tags.append(t)
            row["tags"] = tags
        kept.append(row)
    SEED.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"seed_removed={removed}")
    print(f"seed_total={len(kept)}")


async def patch_db() -> None:
    async with AsyncSessionLocal() as session:
        q = await session.execute(
            select(Exercise).where(
                or_(
                    Exercise.name_ru.ilike("%пуловер%"),
                    Exercise.name_ru.ilike("%прямыми руками%"),
                )
            )
        )
        items = list(q.scalars().all())
        print("before:")
        for it in items:
            print(f"  {it.name_ru!r} deleted={it.is_deleted}")

        canon = next((x for x in items if x.name_ru == CANONICAL), None)
        if canon is None:
            # Create canonical if missing
            canon = Exercise(
                name_ru=CANONICAL,
                muscle_group="спина",
                equipment="блок/кроссовер",
                description=(
                    "Пуловер в блоке на спину (straight-arm pulldown / cable pullover). "
                    "Цель: широчайшие. Оборудование: блок/кроссовер."
                ),
                technique=(
                    "1. Встаньте лицом к верхнему блоку, возьмите прямую рукоять или канат.\n"
                    "2. Сделайте шаг назад, слегка наклонитесь вперёд, руки почти прямые.\n"
                    "3. Тяните рукоять дугой вниз к бёдрам, ощущая работу широчайших.\n"
                    "4. Контролируемо вернитесь вверх, не превращая движение в тягу к груди.\n"
                    "5. Держите корпус стабильным, локти почти не сгибайте."
                ),
                common_mistakes=(
                    "Сгибание локтей как в тяге; работа бицепсом; сильный прогиб поясницы; рывки."
                ),
                difficulty=2,
                animation_url="/exercise-gifs/2330-LEprlgG.gif",
                media_source="none",
                tags=["curated", "manual_add", "replacement", "cable", "pullover", "спина"],
            )
            session.add(canon)
            print("created canonical")
        else:
            canon.is_deleted = False
            canon.muscle_group = "спина"
            canon.equipment = "блок/кроссовер"
            canon.description = (
                "Пуловер в блоке на спину (straight-arm pulldown / cable pullover). "
                "Цель: широчайшие. Оборудование: блок/кроссовер."
            )
            canon.technique = (
                "1. Встаньте лицом к верхнему блоку, возьмите прямую рукоять или канат.\n"
                "2. Сделайте шаг назад, слегка наклонитесь вперёд, руки почти прямые.\n"
                "3. Тяните рукоять дугой вниз к бёдрам, ощущая работу широчайших.\n"
                "4. Контролируемо вернитесь вверх, не превращая движение в тягу к груди.\n"
                "5. Держите корпус стабильным, локти почти не сгибайте."
            )
            canon.common_mistakes = (
                "Сгибание локтей как в тяге; работа бицепсом; сильный прогиб поясницы; рывки."
            )

        soft = 0
        for it in items:
            if it.name_ru in SOFT_DELETE_NAMES:
                if not it.is_deleted:
                    it.is_deleted = True
                    soft += 1
                    print(f"soft-deleted: {it.name_ru}")

        await session.commit()

        q2 = await session.execute(
            select(Exercise.name_ru, Exercise.is_deleted).where(
                or_(
                    Exercise.name_ru.ilike("%пуловер%"),
                    Exercise.name_ru.ilike("%прямыми руками%"),
                )
            ).order_by(Exercise.name_ru)
        )
        print("after:")
        for name, deleted in q2.all():
            print(f"  {name!r} deleted={deleted}")
        print(f"soft_deleted_count={soft}")


def main() -> None:
    patch_seed()
    asyncio.run(patch_db())


if __name__ == "__main__":
    main()
