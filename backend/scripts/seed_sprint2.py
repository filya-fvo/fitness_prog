"""Seed demo exercises/programs for Sprint 2 local testing."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise
from app.models.program import Program

SEED_EXERCISES = [
    {
        "name_ru": "Приседания со своим весом",
        "muscle_group": "ноги",
        "equipment": "без оборудования",
        "description": "Базовое упражнение для квадрицепсов и ягодиц.",
        "technique": "Спина прямая, колени по направлению носков, таз назад.",
        "common_mistakes": "Колени заваливаются внутрь; пятки отрываются от пола.",
        "difficulty": 2,
        "video_url": None,
        "animation_url": None,
    },
    {
        "name_ru": "Отжимания от пола",
        "muscle_group": "грудь",
        "equipment": "без оборудования",
        "description": "Жимовое движение для груди, плеч и трицепса.",
        "technique": "Корпус в планке, локти ~45°, грудь к полу.",
        "common_mistakes": "Провисание поясницы; неполная амплитуда.",
        "difficulty": 2,
        "video_url": None,
        "animation_url": None,
    },
    {
        "name_ru": "Планка",
        "muscle_group": "кор",
        "equipment": "без оборудования",
        "description": "Статическое упражнение для стабилизации корпуса.",
        "technique": "Локти под плечами, тело — прямая линия.",
        "common_mistakes": "Таз слишком высоко или низко.",
        "difficulty": 1,
        "video_url": None,
        "animation_url": None,
    },
    {
        "name_ru": "Тяга гантели в наклоне",
        "muscle_group": "спина",
        "equipment": "гантели",
        "description": "Горизонтальная тяга для широчайших и середины спины.",
        "technique": "Спина нейтральна, тяните локоть к поясу.",
        "common_mistakes": "Скругление поясницы; рывок корпусом.",
        "difficulty": 3,
        "video_url": None,
        "animation_url": None,
    },
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        exercise_count = await session.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.is_deleted.is_(False))
        )
        if int(exercise_count or 0) == 0:
            for item in SEED_EXERCISES:
                session.add(Exercise(**item))
            await session.flush()
            print(f"seeded_exercises={len(SEED_EXERCISES)}")
        else:
            print(f"exercises_exist={exercise_count}")

        exercises = (
            await session.scalars(
                select(Exercise).where(Exercise.is_deleted.is_(False)).order_by(Exercise.name_ru)
            )
        ).all()
        exercise_ids = [str(item.id) for item in exercises[:3]]

        program_count = await session.scalar(
            select(func.count()).select_from(Program).where(Program.is_deleted.is_(False))
        )
        if int(program_count or 0) == 0:
            session.add(
                Program(
                    name="Старт дома 3 дня",
                    description="Простая full-body программа для новичков.",
                    target_level="beginner",
                    duration_weeks=4,
                    structure={
                        "days": [
                            {
                                "day": 1,
                                "title": "Full body A",
                                "exercise_ids": exercise_ids,
                                "rest_sec_default": 60,
                            }
                        ]
                    },
                )
            )
            print("seeded_programs=1")
        else:
            print(f"programs_exist={program_count}")

        await session.commit()
        print("SEED_OK")


if __name__ == "__main__":
    asyncio.run(main())
