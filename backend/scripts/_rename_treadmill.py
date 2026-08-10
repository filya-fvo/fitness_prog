"""Rename exercise «Бег на месте» -> «Беговая дорожка» in seed + DB."""

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
RENAMES = Path(__file__).resolve().parent / "seed_content" / "exercise_renames.json"

OLD = "Бег на месте"
NEW = "Беговая дорожка"


def patch_seed() -> None:
    rows = json.loads(SEED.read_text(encoding="utf-8"))
    changed = 0
    for row in rows:
        if row.get("name_ru") == OLD:
            row["name_ru"] = NEW
            row["equipment"] = "тренажёр"
            row["muscle_group"] = "кардио"
            row["description"] = (
                "Беговая дорожка. Кардио на тренажёре: скорость и наклон. "
                "Не путать с бегом на месте без оборудования."
            )
            row["technique"] = (
                "1. Встаньте на полотно дорожки, возьмитесь за поручни при необходимости.\n"
                "2. Задайте комфортную скорость ходьбы/бега и при желании наклон.\n"
                "3. Смотрите вперёд, корпус слегка наклонён, шаги мягкие.\n"
                "4. Не опирайтесь сильно на поручни — работайте ногами.\n"
                "5. Снижайте скорость перед остановкой, не спрыгивайте на ходу."
            )
            row["common_mistakes"] = (
                "Слишком высокая скорость сразу; удержание поручней всем весом; "
                "взгляд в телефон под ногами."
            )
            tags = list(row.get("tags") or [])
            for t in ("treadmill", "cardio", "machine", "curated"):
                if t not in tags:
                    tags.append(t)
            row["tags"] = tags
            changed += 1
        # if already exists as separate row, leave it
    # Ensure no duplicate NEW from previous partial runs with OLD still present
    names = [r.get("name_ru") for r in rows]
    if names.count(NEW) > 1:
        # keep first NEW, drop later exact duplicates of NEW that came from old rename mess
        seen = False
        kept = []
        for r in rows:
            if r.get("name_ru") == NEW:
                if seen:
                    continue
                seen = True
            kept.append(r)
        rows = kept
    SEED.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"seed_renamed={changed} seed_total={len(rows)}")

    renames: dict[str, str] = {}
    if RENAMES.exists():
        renames = {str(k): str(v) for k, v in json.loads(RENAMES.read_text(encoding="utf-8")).items()}
    renames[OLD] = NEW
    RENAMES.write_text(json.dumps(renames, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"renames_file_updated old={OLD!r} -> new={NEW!r}")


async def patch_db() -> None:
    async with AsyncSessionLocal() as session:
        old_items = list(
            (
                await session.scalars(select(Exercise).where(Exercise.name_ru == OLD))
            ).all()
        )
        new_items = list(
            (
                await session.scalars(select(Exercise).where(Exercise.name_ru == NEW))
            ).all()
        )
        if old_items and new_items:
            # Prefer existing NEW row; soft-delete OLD duplicates
            for it in old_items:
                it.is_deleted = True
                print(f"soft-deleted old row id={it.id}")
            canon = next((x for x in new_items if not x.is_deleted), new_items[0])
            canon.is_deleted = False
            canon.equipment = "тренажёр"
            canon.muscle_group = "кардио"
            canon.description = (
                "Беговая дорожка. Кардио на тренажёре: скорость и наклон. "
                "Не путать с бегом на месте без оборудования."
            )
        elif old_items:
            it = old_items[0]
            it.name_ru = NEW
            it.is_deleted = False
            it.equipment = "тренажёр"
            it.muscle_group = "кардио"
            it.description = (
                "Беговая дорожка. Кардио на тренажёре: скорость и наклон. "
                "Не путать с бегом на месте без оборудования."
            )
            it.technique = (
                "1. Встаньте на полотно дорожки, возьмитесь за поручни при необходимости.\n"
                "2. Задайте комфортную скорость ходьбы/бега и при желании наклон.\n"
                "3. Смотрите вперёд, корпус слегка наклонён, шаги мягкие.\n"
                "4. Не опирайтесь сильно на поручни — работайте ногами.\n"
                "5. Снижайте скорость перед остановкой, не спрыгивайте на ходу."
            )
            for extra in old_items[1:]:
                extra.is_deleted = True
            print(f"renamed db row id={it.id}")
        elif new_items:
            print("already renamed in db")
        else:
            print("WARNING: neither old nor new name found in db")

        await session.commit()
        q = await session.execute(
            select(Exercise.name_ru, Exercise.equipment, Exercise.is_deleted).where(
                Exercise.name_ru.in_([OLD, NEW])
            )
        )
        for row in q.all():
            print("db:", row)


def main() -> None:
    patch_seed()
    asyncio.run(patch_db())


if __name__ == "__main__":
    main()
