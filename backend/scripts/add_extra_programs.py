# -*- coding: utf-8 -*-
"""Append a few high-ROI template programs and upsert into DB."""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.program import Program

SEED = ROOT / "scripts" / "seed_content" / "programs.json"


def ex(name: str, sets: int = 3, reps: str = "6-10", rest: int = 90) -> dict:
    return {"exercise_name": name, "sets": sets, "reps": reps, "rest_sec": rest}


def day(idx: int, name: str, focus: str, items: list[dict]) -> dict:
    return {"day_index": idx, "name": name, "focus": focus, "exercises": items}


def prog(
    *,
    name: str,
    description: str,
    level: str,
    workout_type: str,
    sex: list[str],
    location: str,
    equipment: list[str],
    limitations: list[str],
    days_per_week: int,
    schedule: list[dict],
    session_min: int = 50,
) -> dict:
    return {
        "name": name,
        "description": description,
        "target_level": level,
        "level": level,
        "workout_type": workout_type,
        "duration_weeks": 6,
        "is_template": True,
        "structure": {
            "workout_type": workout_type,
            "level": level,
            "sex": sex,
            "location": location,
            "equipment": equipment,
            "limitations": limitations,
            "days_per_week": days_per_week,
            "session_duration_min": session_min,
            "exclude_warmup": location in {"gym", "outdoor"},
            "schedule": schedule,
        },
    }


EXTRA = [
    prog(
        name="М · Зал · Опытный · Сила FB 3 дня",
        description=(
            "Full body 3×/нед с упором на базовые силовые паттерны: "
            "присед/тяга/жим/тяга в наклоне. Эффективно для силы и мышечной массы."
        ),
        level="intermediate",
        workout_type="strength",
        sex=["male"],
        location="gym",
        equipment=["barbell", "dumbbell", "machine", "cable"],
        limitations=[],
        days_per_week=3,
        schedule=[
            day(
                1,
                "A · Присед + жим",
                "legs_push",
                [
                    ex("Приседания со штангой", 4, "5-8", 120),
                    ex("Жим штанги лёжа", 4, "5-8", 120),
                    ex("Тяга штанги в наклоне", 3, "6-10", 90),
                    ex("Жим гантелей сидя", 3, "8-12", 75),
                    ex("Разгибания на блоке", 3, "10-15", 60),
                    ex("Планка", 3, "30-45с", 45),
                ],
            ),
            day(
                2,
                "B · Тяга + задняя цепь",
                "hinge_pull",
                [
                    ex("Румынская тяга", 4, "6-10", 120),
                    ex("Подтягивания", 4, "5-10", 90),
                    ex("Жим гантелей на наклонной", 3, "8-12", 75),
                    ex("Тяга горизонтального блока", 3, "8-12", 75),
                    ex("Сгибания гантелей на бицепс", 3, "8-12", 60),
                    ex("Подъёмы на носки стоя", 3, "10-15", 45),
                ],
            ),
            day(
                3,
                "C · Объём + односторонние",
                "full",
                [
                    ex("Фронтальные приседания", 3, "6-10", 100),
                    ex("Жим штанги стоя", 3, "6-10", 90),
                    ex("Тяга гантели в наклоне", 3, "8-12", 75),
                    ex("Болгарские выпады", 3, "8-12", 75),
                    ex("Разводка гантелей в стороны", 3, "10-15", 60),
                    ex("Скручивания", 3, "12-15", 45),
                ],
            ),
        ],
    ),
    prog(
        name="Ж · Зал · Опытный · Сила + ягодицы 3 дня",
        description=(
            "3 дня full body с акцентом на ягодицы и верх: hip thrust / RDL / "
            "горизонтальный/вертикальный жим. Хороший баланс силы и формы."
        ),
        level="intermediate",
        workout_type="hypertrophy",
        sex=["female"],
        location="gym",
        equipment=["barbell", "dumbbell", "machine", "cable"],
        limitations=[],
        days_per_week=3,
        schedule=[
            day(
                1,
                "A · Ягодицы + жим",
                "glute_push",
                [
                    ex("Ягодичный мост со штангой", 4, "6-10", 90),
                    ex("Жим гантелей лёжа", 3, "8-12", 75),
                    ex("Тяга верхнего блока", 3, "8-12", 75),
                    ex("Болгарские выпады", 3, "8-12", 75),
                    ex("Разводка гантелей в стороны", 3, "12-15", 60),
                    ex("Планка", 3, "30-45с", 45),
                ],
            ),
            day(
                2,
                "B · Задняя цепь + тяга",
                "hinge_pull",
                [
                    ex("Румынская тяга с гантелями", 4, "8-12", 90),
                    ex("Тяга горизонтального блока", 3, "8-12", 75),
                    ex("Жим в тренажёре", 3, "8-12", 75),
                    ex("Сгибания ног лёжа", 3, "10-15", 60),
                    ex("Сгибания гантелей на бицепс", 3, "10-15", 60),
                    ex("Русские скручивания", 3, "12-15", 45),
                ],
            ),
            day(
                3,
                "C · Квадрицепс + плечи",
                "quad_shoulders",
                [
                    ex("Жим ногами", 4, "8-12", 90),
                    ex("Жим гантелей сидя", 3, "8-12", 75),
                    ex("Тяга гантели в наклоне", 3, "8-12", 75),
                    ex("Выпады назад с гантелями", 3, "10-12", 75),
                    ex("Разгибания на блоке", 3, "10-15", 60),
                    ex("Боковая планка", 3, "20-40с", 45),
                ],
            ),
        ],
    ),
]


async def main() -> None:
    programs = json.loads(SEED.read_text(encoding="utf-8"))
    by_name = {p["name"]: i for i, p in enumerate(programs)}
    for p in EXTRA:
        if p["name"] in by_name:
            programs[by_name[p["name"]]] = p
        else:
            programs.append(p)
    SEED.write_text(json.dumps(programs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("seed programs", len(programs))

    async with AsyncSessionLocal() as session:
        existing = {
            x.name: x
            for x in (
                await session.scalars(select(Program).where(Program.is_deleted.is_(False)))
            ).all()
        }
        created = updated = 0
        for row in EXTRA:
            cur = existing.get(row["name"])
            if cur is None:
                session.add(Program(**row))
                created += 1
            else:
                for k, v in row.items():
                    setattr(cur, k, v)
                updated += 1
        await session.commit()
        print("db created", created, "updated", updated)


if __name__ == "__main__":
    asyncio.run(main())
