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
MANIFEST_PATH = ROOT.parent / "frontend" / "public" / "exercise-gifs" / "exercise-gifs-manifest.json"

DEPRECATED_ALIASES = {
    "Жим гантелей на наклонной скамье",
    "Разводка гантелей лёжа",
    "Тяга нижнего блока к поясу",
    "Жим штанги узким хватом",
}

# Each GIF below is tied to the exact source-dataset exercise ID.
GIF_CABLE_ROW = "/exercise-gifs/0861-fUBheHs.gif"
GIF_CABLE_PUSH = "/exercise-gifs/0201-3ZflifB.gif"
GIF_DB_SKULL = "/exercise-gifs/0351-mpKZGWz.gif"
GIF_CABLE_PULLOVER = "/exercise-gifs/0238-x69MAlq.gif"
GIF_UNDERHAND_PULLDOWN = "/exercise-gifs/0245-xBYcQHj.gif"
GIF_BARBELL_SKULL = "/exercise-gifs/0061-iZop9xO.gif"
GIF_EZ_SKULL = "/exercise-gifs/1748-6CKUx7o.gif"
GIF_STANDING_BARBELL_EXTENSION = "/exercise-gifs/0109-dZl9Q27.gif"
GIF_CABLE_OVERHEAD_EXTENSION = "/exercise-gifs/0194-2IxROQ1.gif"
GIF_ROPE_PUSHDOWN = "/exercise-gifs/0200-dU605di.gif"
GIF_DB_FLY = "/exercise-gifs/0308-yz9nUhF.gif"
GIF_CABLE_DECLINE_FLY = "/exercise-gifs/0158-7saC5zz.gif"
GIF_DB_INCLINE_PRESS = "/exercise-gifs/0314-ns0SIbU.gif"
GIF_DB_LATERAL_RAISE = "/exercise-gifs/0334-DsgkuIt.gif"
GIF_REVERSE_GRIP_PULL_UP = "/exercise-gifs/0674-YAk5dIw.gif"
GIF_SMITH_BENCH = "/exercise-gifs/0748-trqKQv2.gif"
GIF_INCLINE_MACHINE_PRESS = "/exercise-gifs/1299-jHAnWmT.gif"
GIF_PEC_DECK = "/exercise-gifs/0596-v3xmPAR.gif"
GIF_MACHINE_SHOULDER_PRESS = "/exercise-gifs/0603-67n3r98.gif"
GIF_CABLE_LATERAL_RAISE = "/exercise-gifs/0178-goJ6ezq.gif"
GIF_MACHINE_ROW = "/exercise-gifs/1350-7I6LNUG.gif"
GIF_NEUTRAL_PULLDOWN = "/exercise-gifs/0818-rkg41Fb.gif"
GIF_SEATED_LEG_CURL = "/exercise-gifs/0599-Zg3XY7P.gif"
GIF_SMITH_HIP_RAISE = "/exercise-gifs/0756-CqhoytW.gif"
GIF_MACHINE_CALF_RAISE = "/exercise-gifs/0605-ykUOVze.gif"
GIF_INCLINE_CURL = "/exercise-gifs/0315-F3xgbjF.gif"
GIF_CABLE_CRUNCH = "/exercise-gifs/0175-WW95auq.gif"
GIF_PALLOF = "/exercise-gifs/0979-9pa4H5m.gif"


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
        "description": description or (
            f"{name_ru}. © Gym Visual — https://gymvisual.com/"
            if tags and "gymvisual" in tags
            else f"{name_ru}."
        ),
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
        animation_url=GIF_CABLE_PULLOVER,
        common_mistakes="Сгибание локтей как в тяге; работа бицепсом; сильный прогиб поясницы; рывки.",
        tags=["gymvisual", "ds:0238", "curated", "manual_add", "replacement", "cable", "pullover", "спина"],
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
        animation_url=GIF_BARBELL_SKULL,
        common_mistakes="Разведение локтей; слишком большой вес; удар грифом по лбу; отрыв поясницы.",
        tags=["gymvisual", "ds:0061", "curated", "manual_add", "replacement", "barbell", "трицепс", "french press"],
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
        animation_url=GIF_EZ_SKULL,
        tags=["gymvisual", "ds:1748", "curated", "manual_add", "replacement", "barbell", "трицепс"],
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
        animation_url=GIF_STANDING_BARBELL_EXTENSION,
        tags=["gymvisual", "ds:0109", "curated", "manual_add", "replacement", "barbell", "трицепс"],
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
        animation_url=GIF_CABLE_OVERHEAD_EXTENSION,
        tags=["gymvisual", "ds:0194", "curated", "manual_add", "replacement", "cable", "трицепс"],
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
        animation_url=GIF_ROPE_PUSHDOWN,
        tags=["gymvisual", "ds:0200", "curated", "manual_add", "replacement", "cable", "трицепс"],
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
        animation_url=GIF_UNDERHAND_PULLDOWN,
        tags=["gymvisual", "ds:0245", "curated", "manual_add", "replacement", "cable", "спина"],
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
        animation_url=GIF_DB_FLY,
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
        animation_url=GIF_CABLE_DECLINE_FLY,
        tags=["gymvisual", "ds:0158", "curated", "manual_add", "replacement", "cable", "грудь"],
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
        animation_url=GIF_DB_INCLINE_PRESS,
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
        animation_url=GIF_DB_LATERAL_RAISE,
        tags=["gymvisual", "ds:0334", "curated", "manual_add", "replacement", "плечи"],
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
        animation_url="/exercise-gifs/0027-eZyBC3j.gif",
        tags=["gymvisual", "ds:0027", "curated", "manual_add", "replacement", "barbell", "спина"],
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
        animation_url=GIF_REVERSE_GRIP_PULL_UP,
        tags=["gymvisual", "ds:0674", "curated", "manual_add", "replacement", "спина"],
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
        tags=["gymvisual", "ds:0375", "curated", "manual_add", "replacement", "pullover", "спина"],
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

NEW_ITEMS.extend(
    [
        ex(
            "Жим лёжа в машине Смита", "грудь", "машина Смита", 3,
            "1. Настройте скамью так, чтобы гриф опускался к середине груди.\n"
            "2. Сведите лопатки, стопы плотно прижмите к полу.\n"
            "3. Снимите гриф с фиксаторов и опускайте подконтрольно.\n"
            "4. Выжмите гриф вверх без жёсткого замыкания локтей.",
            animation_url=GIF_SMITH_BENCH,
            tags=["gymvisual", "ds:0748", "curated", "replacement", "smith", "грудь"],
        ),
        ex(
            "Жим на наклонной в тренажёре", "грудь", "тренажёр", 2,
            "1. Настройте сиденье: рукояти должны быть у верхней части груди.\n"
            "2. Прижмите спину к опоре и сведите лопатки.\n"
            "3. Выжмите рукояти вперёд-вверх.\n4. Медленно вернитесь до комфортного растяжения.",
            animation_url=GIF_INCLINE_MACHINE_PRESS,
            tags=["gymvisual", "ds:1299", "curated", "replacement", "machine", "грудь"],
        ),
        ex(
            "Сведение рук в тренажёре «бабочка»", "грудь", "тренажёр", 2,
            "1. Настройте сиденье, чтобы локти были примерно на уровне груди.\n"
            "2. Прижмите спину, держите локти мягкими.\n"
            "3. Сведите рукояти перед собой.\n4. Вернитесь без рывка, сохраняя натяжение груди.",
            animation_url=GIF_PEC_DECK,
            tags=["gymvisual", "ds:0596", "curated", "replacement", "machine", "грудь"],
        ),
        ex(
            "Жим вверх в тренажёре сидя", "плечи", "тренажёр", 2,
            "1. Настройте сиденье: рукояти начинаются около уровня плеч.\n"
            "2. Прижмите спину и напрягите корпус.\n"
            "3. Выжмите рукояти вверх.\n4. Опускайте до комфортной глубины без рывка.",
            animation_url=GIF_MACHINE_SHOULDER_PRESS,
            tags=["gymvisual", "ds:0603", "curated", "replacement", "machine", "плечи"],
        ),
        ex(
            "Отведение руки в сторону на блоке", "плечи", "блок/кроссовер", 2,
            "1. Встаньте боком к нижнему блоку и возьмите рукоять дальней рукой.\n"
            "2. Слегка согните локоть.\n3. Поднимите руку в сторону до уровня плеч.\n"
            "4. Медленно опустите, не раскачивая корпус.",
            animation_url=GIF_CABLE_LATERAL_RAISE,
            tags=["gymvisual", "ds:0178", "curated", "replacement", "cable", "плечи"],
        ),
        ex(
            "Тяга с упором грудью в тренажёре", "спина", "тренажёр", 2,
            "1. Настройте сиденье и упритесь грудью в подушку.\n"
            "2. Начните с вытянутых рук и опущенных плеч.\n"
            "3. Тяните рукояти к корпусу, сводя лопатки.\n4. Верните вес без отрыва груди.",
            animation_url=GIF_MACHINE_ROW,
            tags=["gymvisual", "ds:1350", "curated", "replacement", "machine", "спина"],
        ),
        ex(
            "Тяга верхнего блока нейтральным хватом", "спина", "блок/кроссовер", 2,
            "1. Возьмите параллельные рукояти, зафиксируйте бёдра.\n"
            "2. Слегка отклоните корпус назад.\n3. Тяните рукоять к верхней части груди.\n"
            "4. Полностью и подконтрольно выпрямите руки.",
            animation_url=GIF_NEUTRAL_PULLDOWN,
            tags=["gymvisual", "ds:0818", "curated", "replacement", "cable", "спина"],
        ),
        ex(
            "Сгибания ног сидя", "ноги", "тренажёр", 2,
            "1. Совместите колени с осью тренажёра и зафиксируйте бёдра валиком.\n"
            "2. Согните ноги, направляя пятки вниз-назад.\n"
            "3. Сделайте короткую паузу.\n4. Медленно верните вес, не бросая стек.",
            animation_url=GIF_SEATED_LEG_CURL,
            tags=["gymvisual", "ds:0599", "curated", "replacement", "machine", "ноги"],
        ),
        ex(
            "Ягодичный мост в машине Смита", "ноги", "машина Смита", 3,
            "1. Упритесь верхом спины в скамью, гриф расположите на сгибе таза через накладку.\n"
            "2. Поставьте стопы устойчиво.\n3. Поднимите таз до прямой линии плечи–таз–колени.\n"
            "4. Сожмите ягодицы и опуститесь подконтрольно.",
            animation_url=GIF_SMITH_HIP_RAISE,
            tags=["gymvisual", "ds:0756", "curated", "replacement", "smith", "ноги"],
        ),
        ex(
            "Подъёмы на носки стоя в тренажёре", "ноги", "тренажёр", 2,
            "1. Установите плечи под упоры, носки поставьте на край платформы.\n"
            "2. Опустите пятки до комфортного растяжения.\n"
            "3. Поднимитесь максимально высоко на носки.\n4. Не пружиньте в нижней точке.",
            animation_url=GIF_MACHINE_CALF_RAISE,
            tags=["gymvisual", "ds:0605", "curated", "replacement", "machine", "ноги"],
        ),
        ex(
            "Сгибания гантелей на бицепс на наклонной скамье", "бицепс", "гантели", 2,
            "1. Сядьте на наклонную скамью, руки свободно опустите.\n"
            "2. Не выводя локти вперёд, согните руки.\n"
            "3. Сожмите бицепс вверху.\n4. Медленно опустите гантели до полного растяжения.",
            animation_url=GIF_INCLINE_CURL,
            tags=["gymvisual", "ds:0315", "curated", "replacement", "dumbbells", "бицепс"],
        ),
        ex(
            "Скручивания на верхнем блоке", "кор", "блок/кроссовер", 2,
            "1. Встаньте на колени спиной или лицом к верхнему блоку, канат держите у головы.\n"
            "2. Зафиксируйте таз.\n3. Скрутите грудную клетку к тазу усилием пресса.\n"
            "4. Вернитесь, не разгибая поясницу чрезмерно.",
            animation_url=GIF_CABLE_CRUNCH,
            tags=["gymvisual", "ds:0175", "curated", "replacement", "cable", "кор"],
        ),
        ex(
            "Жим Паллофа с резинкой", "кор", "резинка", 2,
            "1. Встаньте боком к закреплённой резинке и держите её у груди.\n"
            "2. Напрягите корпус и выжмите руки перед собой.\n"
            "3. Не позволяйте корпусу поворачиваться.\n4. Верните руки и выполните на другую сторону.",
            animation_url=GIF_PALLOF,
            tags=["gymvisual", "ds:0979", "curated", "replacement", "bands", "кор"],
        ),
    ]
)


def patch_seed() -> list[str]:
    rows = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    rows = [row for row in rows if str(row.get("name_ru")) not in DEPRECATED_ALIASES]
    corrections = {
        "Ягодичный мост": {
            "muscle_group": "ноги",
            "equipment": "свой вес",
            "description": "Ягодичный мост без отягощения. Цель: ягодичные. Оборудование: body weight. © Gym Visual — https://gymvisual.com/",
            "technique": "1. Лягте на спину, согните колени и поставьте стопы на пол.\n2. Напрягите корпус и ягодицы.\n3. Поднимите таз до прямой линии от колен до плеч.\n4. Задержитесь вверху и медленно опуститесь.\n5. Не переразгибайте поясницу.",
            "difficulty": 1,
            "animation_url": "/exercise-gifs/3013-u0cNiij.gif",
            "tags": ["gymvisual", "ds:3013", "© Gym Visual", "curated", "load:reps_only"],
        },
        "Ягодичный мост со штангой": {
            "muscle_group": "ноги",
            "equipment": "штанга",
            "description": "Ягодичный мост со штангой. Цель: ягодичные. Оборудование: barbell. © Gym Visual — https://gymvisual.com/",
            "technique": "1. Лягте на спину и поставьте стопы устойчиво.\n2. Разместите штангу на сгибе таза через мягкую накладку.\n3. Поднимите таз усилием ягодиц до прямой линии от колен до плеч.\n4. Задержитесь вверху и опуститесь подконтрольно.\n5. Не переразгибайте поясницу.",
            "difficulty": 3,
            "animation_url": "/exercise-gifs/1409-qKBpF7I.gif",
            "tags": ["gymvisual", "ds:1409", "© Gym Visual", "curated", "barbell", "ноги"],
        },
    }
    for row in rows:
        patch = corrections.get(str(row.get("name_ru")))
        if patch:
            row.update(patch)
    by_name = {str(r.get("name_ru")): r for r in rows}
    added: list[str] = []
    for item in NEW_ITEMS:
        name = item["name_ru"]
        if name in DEPRECATED_ALIASES:
            continue
        if name in by_name:
            by_name[name].update({key: value for key, value in item.items() if value is not None})
            continue
        rows.append(item)
        by_name[name] = item
        added.append(name)
    SEED_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = [
        {
            "name_ru": row["name_ru"],
            "file": Path(str(row.get("animation_url") or "")).name,
            "animation_url": row.get("animation_url"),
            "muscle_group": row.get("muscle_group"),
        }
        for row in rows
        if row.get("animation_url")
    ]
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
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
