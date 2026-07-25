"""Seed / expand nutrition_products from seed_content/nutrition_products_v2.json."""
from __future__ import annotations
import asyncio, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.nutrition import NutritionProduct
DATA = Path(__file__).resolve().parent / "seed_content" / "nutrition_products_v2.json"
async def main() -> None:
    items = json.loads(DATA.read_text(encoding="utf-8"))
    async with AsyncSessionLocal() as session:
        existing = {
            n: i
            for n, i in (
                await session.execute(
                    select(NutritionProduct.name_ru, NutritionProduct.id).where(
                        NutritionProduct.is_deleted.is_(False)
                    )
                )
            ).all()
        }
        # simpler: names set
        names = set(
            await session.scalars(
                select(NutritionProduct.name_ru).where(NutritionProduct.is_deleted.is_(False))
            )
        )
        added = 0
        for row in items:
            name = row["name_ru"]
            if name in names:
                continue
            session.add(
                NutritionProduct(
                    name_ru=name,
                    calories=row.get("calories") or 0,
                    proteins=row.get("proteins") or 0,
                    fats=row.get("fats") or 0,
                    carbs=row.get("carbs") or 0,
                    category=row.get("category"),
                    source=row.get("source") if row.get("source") in ("manual","openfoodfacts") else "manual",
                )
            )
            names.add(name)
            added += 1
        await session.commit()
        print(f"nutrition seed_v2: added={added} catalog={len(items)} db_names>={len(names)}")
if __name__ == "__main__":
    asyncio.run(main())

