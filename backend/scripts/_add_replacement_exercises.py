"""Add missing replacement exercises to seed_content/exercises.json and seed DB."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

CONTENT = Path(__file__).resolve().parent / "seed_content"
SEED_PATH = CONTENT / "exercises.json"

# Reuse closest existing GIFs so UI is not empty until dedicated media is added.
GIF_CABLE_ROW = "/exercise-gifs/0861-fUBheHs.gif"
GIF_CABLE_PUSH = "/exercise-gifs/0201-3ZflifB.gif"
GIF_DB_SKULL = "/exercise-gifs/0351-mpKZGWz.gif"
GIF_LAT_PD = "/exercise-gifs/2330-LEprlgG.gif"


def ex(
    name_ru: str,
    muscle_group: str,
    equipment: str,
    difficulty: int,
    technique: str,
    *,
    description: str | None = None,
    animation_url: str | None = None,
    common_mistakes: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    return {
        "name_ru": name_ru,
        "muscle_group": muscle_group,
        "equipment": equipment,
        "description": description or f"{name_ru}.",
        "technique": technique,
        "common_mistakes": common_mistakes,
        "difficulty": difficulty,
        "video_url": None,
        "animation_url": animation_url,
        "thumbnail_url": None,
        "media_duration_sec": None,
        "media_source": "none",
        "tags": tags or ["curated", "manual_add", "replacement"],
    }


NEW_ITEMS: list[dict] = [
    # One canonical cable pullover only (straight-arm pulldown).
    ex(
        "Пуловер в блоке на спину",
        "спина",
        "блок/кроссовер",
        2,
        "1. Встаньте лицом к верхнему блоку, возьмите прямую рукоять или канат.\n"
        "2. Сделайте шаг назад, слегка наклонитесь вперёд, руки почти прямые.\n"
        "3. Тяните рукоять дугой вниз к бёдрам, ощущая работу широчайших.\n"
        "4. Контролируемо вернитесь вверх, не превращая движение в тягу к груди.\n"
        "5. Держите корпус стабильным, локти почти не сгибайте.",
        description=(
            "Пуловер в блоке на спину (straight-arm pulldown / cable pullover). "
            "Цель: широчайшие. Оборудование: блок/кроссовер."
        ),
        animation_url=GIF_LAT_PD,
        common_mistakes="Сгибание локтей как в тяге; работа бицепсом; сильный прогиб поясницы; рывки.",
        tags=["curated", "manual_add", "replacement", "cable", "pullover", "спина"],
    ),
    ex(
        "Французский жим со штангой",
        "трицепс",
        "штанга",
        3,
        "1. Лягте на горизонтальную скамью, возьмите штангу (лучше EZ) узким хватом.\n"
        "2. Выжмите штангу над грудью, локти направлены вверх/вперёд.\n"
        "3. Сгибая только локти, опустите гриф ко лбу или чуть за голову.\n"
        "4. Разгибанием локтей верните штангу вверх, не разводя локти в стороны.\n"
        "5. Работайте в контролируемой амплитуде.",
        description="Французский жим со штангой (skull crusher). Цель: трицепс. Оборудование: штанга.",
        animation_url=GIF_DB_SKULL,
        common_mistakes="Разведение локтей; слишком большой вес; удар грифом по лбу; отрыв поясницы.",
        tags=["curated", "manual_add", "replacement", "barbell", "трицепс", "french press"],
    ),
    ex(
        "Французский жим EZ-грифом",
        "трицепс",
        "штанга",
        2,
        "1. Лягте на скамью с EZ-грифом, хват по удобным изгибам.\n"
        "2. Выпрямите руки над грудью.\n"
        "3. Опустите гриф ко лбу/за голову, сохраняя плечи неподвижными.\n"
        "4. Разогните локти и вернитесь в старт.\n"
        "5. EZ-хват снижает нагрузку на запястья.",
        description="Французский жим с EZ-грифом — комфортнее для запястий, чем прямой гриф.",
        animation_url=GIF_DB_SKULL,
        tags=["curated", "manual_add", "replacement", "barbell", "трицепс"],
    ),
    ex(
        "Французский жим стоя со штангой",
        "трицепс",
        "штанга",
        3,
        "1. Встаньте прямо, штанга/EZ над головой на вытянутых руках.\n"
        "2. Локти смотрят вперёд, плечи зафиксированы.\n"
        "3. Опустите гриф за голову, сгибая локти.\n"
        "4. Разогните руки вверх до полного разгибания без клика в локтях.\n"
        "5. Держите корпус стабильным, не прогибайтесь чрезмерно.",
        description="Французский жим стоя со штангой. Длинная голова трицепса.",
        animation_url=GIF_DB_SKULL,
        tags=["curated", "manual_add", "replacement", "barbell", "трицепс"],
    ),
    ex(
        "Разгибания из-за головы на блоке",
        "трицепс",
        "блок/кроссовер",
        2,
        "1. Встаньте спиной к верхнему блоку, рукоять за головой.\n"
        "2. Локти направлены вверх, плечи неподвижны.\n"
        "3. Разгибайте руки вверх/вперёд до полного выпрямления.\n"
        "4. Медленно вернитесь в растянутое положение.\n"
        "5. Не разводите локти в стороны.",
        description="Overhead cable triceps extension — замена французскому жиму.",
        animation_url=GIF_CABLE_PUSH,
        tags=["curated", "manual_add", "replacement", "cable", "трицепс"],
    ),
    ex(
        "Жим вниз на блоке канатом",
        "трицепс",
        "блок/кроссовер",
        2,
        "1. Возьмите канат верхнего блока, локти прижаты к корпусу.\n"
        "2. Из положения предплечий параллельно полу разогните руки вниз.\n"
        "3. Внизу слегка разведите концы каната.\n"
        "4. Контролируемо вернитесь вверх.\n"
        "5. Не раскачивайте корпус.",
        description="Классические разгибания на блоке канатом для трицепса.",
        animation_url=GIF_CABLE_PUSH,
        tags=["curated", "manual_add", "replacement", "cable", "трицепс"],
    ),
    ex(
        "Тяга нижнего блока к поясу",
        "спина",
        "блок/кроссовер",
        2,
        "1. Сядьте в тренажёр горизонтальной тяги, стопы на платформе.\n"
        "2. Возьмите рукоять, спина прямая, грудь вперёд.\n"
        "3. Тяните рукоять к поясу, сводя лопатки.\n"
        "4. Плавно верните вес, не округляя поясницу.\n"
        "5. Не используйте инерцию корпуса.",
        description="Горизонтальная тяга блока к поясу — базовая тяга для спины.",
        animation_url=GIF_CABLE_ROW,
        tags=["curated", "manual_add", "replacement", "cable", "спина"],
    ),
    ex(
        "Тяга верхнего блока обратным хватом",
        "спина",
        "блок/кроссовер",
        2,
        "1. Возьмите рукоять верхнего блока обратным (супинированным) хватом.\n"
        "2. Сядьте, бёдра зафиксированы валиками.\n"
        "3. Тяните рукоять к верхней части груди, локти вдоль корпуса.\n"
        "4. Сожмите лопатки внизу, затем контролируемо вернитесь вверх.\n"
        "5. Не отклоняйтесь сильно назад.",
        description="Подтягивающий паттерн на блоке обратным хватом.",
        animation_url=GIF_LAT_PD,
        tags=["curated", "manual_add", "replacement", "cable", "спина"],
    ),
    ex(
        "Разводка гантелей лёжа",
        "грудь",
        "гантели",
        2,
        "1. Лягте на скамью, гантели над грудью, небольшой сгиб в локтях.\n"
        "2. Разведите руки в стороны по широкой дуге до растяжения груди.\n"
        "3. Сведите гантели обратно над грудью по той же дуге.\n"
        "4. Не выпрямляйте локти полностью.\n"
        "5. Контролируйте негативную фазу.",
        description="Изоляция груди, хорошая замена жимовым движениям в пампе.",
        tags=["curated", "manual_add", "replacement", "грудь"],
    ),
    ex(
        "Кроссовер на верхних блоках",
        "грудь",
        "блок/кроссовер",
        2,
        "1. Встаньте между стойками кроссовера, рукояти в верхнем положении.\n"
        "2. Шагните вперёд, корпус слегка наклонён, локти мягкие.\n"
        "3. Сведите руки перед собой вниз-вперёд по дуге.\n"
        "4. Медленно вернитесь в растяжение.\n"
        "5. Не округляйте плечи вперёд чрезмерно.",
        description="Сведение на кроссовере — изоляция груди.",
        tags=["curated", "manual_add", "replacement", "cable", "грудь"],
    ),
    ex(
        "Жим гантелей на наклонной скамье",
        "грудь",
        "гантели",
        2,
        "1. Установите скамью под 30–45°.\n"
        "2. Жмите гантели вверх над верхней частью груди.\n"
        "3. Опускайте до комфортного растяжения, локти ~45° к корпусу.\n"
        "4. Выжмите вверх, не ударяя гантели друг о друга.\n"
        "5. Стопы устойчиво на полу.",
        description="Наклонный жим гантелей — акцент на верх груди.",
        tags=["curated", "manual_add", "replacement", "грудь"],
    ),
    ex(
        "Махи гантелями в стороны",
        "плечи",
        "гантели",
        2,
        "1. Встаньте прямо, гантели по бокам, лёгкий сгиб локтей.\n"
        "2. Поднимите руки в стороны до уровня плеч.\n"
        "3. Мизинцы чуть выше больших пальцев (как разливая воду).\n"
        "4. Медленно опустите.\n"
        "5. Не раскачивайте корпус.",
        description="Средняя дельта, классические боковые махи.",
        tags=["curated", "manual_add", "replacement", "плечи"],
    ),
    ex(
        "Тяга штанги в наклоне",
        "спина",
        "штанга",
        3,
        "1. Наклонитесь вперёд с почти прямой спиной, штанга в руках.\n"
        "2. Тяните гриф к низу живота/поясу.\n"
        "3. Сводите лопатки вверху движения.\n"
        "4. Опустите штангу контролируемо.\n"
        "5. Не округляйте поясницу.",
        description="Базовая тяга штанги в наклоне для толщины спины.",
        tags=["curated", "manual_add", "replacement", "barbell", "спина"],
    ),
    ex(
        "Подтягивания обратным хватом",
        "спина",
        "свой вес",
        3,
        "1. Возьмитесь за перекладину обратным хватом на ширине плеч.\n"
        "2. Из виса подтянитесь, пока подбородок не окажется выше грифа.\n"
        "3. Опуститесь полностью, сохраняя контроль.\n"
        "4. Не раскачивайтесь.\n"
        "5. При необходимости используйте резину или гравитрон.",
        description="Подтягивания супинированным хватом — спина + бицепс.",
        tags=["curated", "manual_add", "replacement", "спина"],
    ),
    ex(
        "Пуловер с гантелью лёжа поперёк скамьи",
        "спина",
        "гантели",
        2,
        "1. Лягте поперёк скамьи, опираясь верхней частью спины, стопы на полу.\n"
        "2. Держите одну гантель двумя руками над грудью.\n"
        "3. Опустите гантель за голову по дуге, растягивая широчайшие и грудь.\n"
        "4. Верните гантель над грудью силой спины/груди, локти слегка согнуты.\n"
        "5. Не проваливайте таз слишком низко.",
        description="Классический пуловер поперёк скамьи — вариант с акцентом на спину/растяжение.",
        animation_url="/exercise-gifs/0375-9XjtHvS.gif",
        tags=["curated", "manual_add", "replacement", "pullover", "спина"],
    ),
    ex(
        "Жим штанги узким хватом",
        "трицепс",
        "штанга",
        3,
        "1. Лягте на скамью, хват уже плеч (но комфортный для запястий).\n"
        "2. Опустите гриф к нижней части груди, локти вдоль корпуса.\n"
        "3. Выжмите штангу вверх, полностью разгибая локти без хлопка.\n"
        "4. Не разводите локти широко.\n"
        "5. Контролируйте опускание.",
        description="Узкий жим штанги — сила трицепса и жимовой паттерн.",
        animation_url="/exercise-gifs/0030-J6Dx1Mu.gif",
        tags=["curated", "manual_add", "replacement", "barbell", "трицепс"],
    ),
]


def patch_seed() -> list[str]:
    rows = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    existing = {str(r.get("name_ru")) for r in rows}
    added: list[str] = []
    for item in NEW_ITEMS:
        name = item["name_ru"]
        if name in existing:
            continue
        rows.append(item)
        existing.add(name)
        added.append(name)
    SEED_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"seed_total={len(rows)} seed_added={len(added)}")
    for n in added:
        print(f" + {n}")
    return added


async def seed_db() -> None:
    import importlib.util

    seed_mod_path = Path(__file__).resolve().parent / "seed_prod_content.py"
    spec = importlib.util.spec_from_file_location("seed_prod_content", seed_mod_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load seed_prod_content.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    from app.core.database import AsyncSessionLocal
    from app.models.exercise import Exercise
    from sqlalchemy import func, select

    async with AsyncSessionLocal() as session:
        created, updated = await mod.upsert_exercises(session)
        await session.commit()
        total = await session.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.is_deleted.is_(False))
        )
        names = [
            "Пуловер в блоке",
            "Пуловер в блоке на спину",
            "Французский жим со штангой",
            "Французский жим EZ-грифом",
        ]
        found = list(
            (
                await session.scalars(
                    select(Exercise.name_ru).where(
                        Exercise.is_deleted.is_(False),
                        Exercise.name_ru.in_(names),
                    )
                )
            ).all()
        )
        print(f"DB_OK created={created} updated={updated} total={total}")
        print("verified:", ", ".join(sorted(found)))


def main() -> None:
    patch_seed()
    asyncio.run(seed_db())


if __name__ == "__main__":
    main()
