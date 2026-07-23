"""Seed a small local nutrition_products set for MVP autocomplete."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.nutrition import NutritionProduct

PRODUCTS = [
    ("Куриная грудка", 110, 23.0, 1.2, 0.0, "meat"),
    ("Гречка варёная", 110, 4.2, 1.1, 21.0, "grains"),
    ("Рис варёный", 130, 2.7, 0.3, 28.0, "grains"),
    ("Яйцо куриное", 155, 13.0, 11.0, 1.1, "eggs"),
    ("Творог 5%", 121, 17.0, 5.0, 1.8, "dairy"),
    ("Овсянка на воде", 88, 3.0, 1.7, 15.0, "grains"),
    ("Банан", 96, 1.5, 0.5, 21.0, "fruit"),
    ("Яблоко", 52, 0.3, 0.2, 14.0, "fruit"),
    ("Лосось", 208, 20.0, 13.0, 0.0, "fish"),
    ("Оливковое масло", 884, 0.0, 100.0, 0.0, "oils"),
    ("Протеин сывороточный", 400, 75.0, 5.0, 10.0, "supplements"),
    ("Хлеб цельнозерновой", 247, 9.0, 3.5, 41.0, "bakery"),
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(NutritionProduct.id).limit(1))
        if existing:
            print("nutrition_products already has data — skip")
            return
        for name, cal, p, f, c, cat in PRODUCTS:
            session.add(
                NutritionProduct(
                    name_ru=name,
                    calories=cal,
                    proteins=p,
                    fats=f,
                    carbs=c,
                    category=cat,
                    source="manual",
                )
            )
        await session.commit()
        print(f"seeded {len(PRODUCTS)} products")


if __name__ == "__main__":
    asyncio.run(main())
