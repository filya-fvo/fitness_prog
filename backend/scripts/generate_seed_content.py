"""Generate exercises.json (100) and programs.json (8) for P0 seed."""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "seed_content"
OUT.mkdir(parents=True, exist_ok=True)

GROUPS: dict[str, list[tuple[str, str, int, str]]] = {
    "ноги": [
        ("Приседания со своим весом", "bodyweight", 2, "home"),
        ("Приседания с гантелью у груди", "dumbbells", 2, "home"),
        ("Приседания со штангой", "barbell", 3, "gym"),
        ("Фронтальные приседания", "barbell", 4, "gym"),
        ("Выпады вперёд", "bodyweight", 2, "home"),
        ("Выпады назад с гантелями", "dumbbells", 3, "home"),
        ("Болгарские выпады", "dumbbells", 3, "home"),
        ("Жим ногами", "machine", 2, "gym"),
        ("Разгибания ног", "machine", 1, "gym"),
        ("Сгибания ног лёжа", "machine", 2, "gym"),
        ("Румынская тяга", "barbell", 3, "gym"),
        ("Румынская тяга с гантелями", "dumbbells", 3, "home"),
        ("Становая тяга классическая", "barbell", 4, "gym"),
        ("Ягодичный мост", "bodyweight", 1, "home"),
        ("Ягодичный мост со штангой", "barbell", 3, "gym"),
        ("Подъёмы на носки стоя", "bodyweight", 1, "home"),
        ("Подъёмы на носки сидя", "machine", 1, "gym"),
        ("Зашагивания на тумбу", "dumbbells", 2, "home"),
        ("Боковые выпады", "bodyweight", 2, "home"),
        ("Сумо-приседания", "dumbbells", 2, "home"),
    ],
    "грудь": [
        ("Отжимания от пола", "bodyweight", 2, "home"),
        ("Отжимания с колен", "bodyweight", 1, "home"),
        ("Отжимания с возвышения", "bodyweight", 1, "home"),
        ("Жим гантелей лёжа", "dumbbells", 2, "home"),
        ("Жим штанги лёжа", "barbell", 3, "gym"),
        ("Жим гантелей на наклонной", "dumbbells", 3, "gym"),
        ("Разведение гантелей лёжа", "dumbbells", 2, "home"),
        ("Сведение рук в кроссовере", "cable", 2, "gym"),
        ("Отжимания на брусьях", "bodyweight", 3, "gym"),
        ("Жим в тренажёре", "machine", 1, "gym"),
    ],
    "спина": [
        ("Тяга гантели в наклоне", "dumbbells", 2, "home"),
        ("Тяга штанги в наклоне", "barbell", 3, "gym"),
        ("Тяга верхнего блока", "cable", 2, "gym"),
        ("Тяга горизонтального блока", "cable", 2, "gym"),
        ("Подтягивания", "pullup_bar", 4, "gym"),
        ("Австралийские подтягивания", "bodyweight", 2, "home"),
        ("Тяга Т-грифа", "barbell", 3, "gym"),
        ("Пуловер с гантелью", "dumbbells", 2, "home"),
        ("Гиперэкстензия", "bodyweight", 2, "gym"),
        ("Тяга к лицу", "cable", 2, "gym"),
        ("Тяга резинки к поясу", "bands", 1, "home"),
        ("Шраги с гантелями", "dumbbells", 2, "home"),
    ],
    "плечи": [
        ("Жим гантелей сидя", "dumbbells", 2, "home"),
        ("Жим штанги стоя", "barbell", 3, "gym"),
        ("Разводка гантелей в стороны", "dumbbells", 2, "home"),
        ("Разводка в наклоне", "dumbbells", 2, "home"),
        ("Подъёмы гантелей перед собой", "dumbbells", 1, "home"),
        ("Тяга к подбородку", "barbell", 3, "gym"),
        ("Жим Арнольда", "dumbbells", 3, "home"),
        ("Обратные разведения в тренажёре", "machine", 2, "gym"),
    ],
    "бицепс": [
        ("Сгибания гантелей на бицепс", "dumbbells", 1, "home"),
        ("Сгибания со штангой", "barbell", 2, "gym"),
        ("Молотковые сгибания", "dumbbells", 2, "home"),
        ("Сгибания на скамье Скотта", "barbell", 2, "gym"),
        ("Сгибания на нижнем блоке", "cable", 2, "gym"),
    ],
    "трицепс": [
        ("Французский жим гантели", "dumbbells", 2, "home"),
        ("Разгибания на блоке", "cable", 1, "gym"),
        ("Отжимания узким хватом", "bodyweight", 2, "home"),
        ("Жим лёжа узким хватом", "barbell", 3, "gym"),
        ("Разгибания гантели из-за головы", "dumbbells", 2, "home"),
    ],
    "кор": [
        ("Планка", "bodyweight", 1, "home"),
        ("Боковая планка", "bodyweight", 2, "home"),
        ("Скручивания", "bodyweight", 1, "home"),
        ("Велосипед", "bodyweight", 2, "home"),
        ("Подъёмы ног лёжа", "bodyweight", 2, "home"),
        ("Мёртвый жук", "bodyweight", 1, "home"),
        ("Птица-собака", "bodyweight", 1, "home"),
        ("Русские скручивания", "bodyweight", 2, "home"),
        ("Альпинисты", "bodyweight", 2, "home"),
        ("Удержание «лодочки»", "bodyweight", 3, "home"),
    ],
    "кардио": [
        ("Бёрпи", "bodyweight", 3, "home"),
        ("Прыжки «звездой»", "bodyweight", 1, "home"),
        ("Высокие колени", "bodyweight", 1, "home"),
        ("Прыжки на скакалке", "none", 2, "home"),
        ("Гребля в тренажёре", "machine", 2, "gym"),
        ("Велотренажёр", "machine", 1, "gym"),
        ("Эллипс", "machine", 1, "gym"),
        ("Беговая дорожка", "machine", 1, "gym"),
        ("Скейтер-прыжки", "bodyweight", 2, "home"),
        ("Махи гирей", "kettlebell", 3, "gym"),
    ],
    "мобильность": [
        ("Кошка-корова", "bodyweight", 1, "home"),
        ("Раскрытие грудного отдела у стены", "bodyweight", 1, "home"),
        ("Растяжка сгибателей бедра", "bodyweight", 1, "home"),
        ("Поза голубя", "bodyweight", 1, "home"),
        ("Вращения таза", "bodyweight", 1, "home"),
        ("Мобилизация голеностопа", "bodyweight", 1, "home"),
        ("Растяжка грушевидной", "bodyweight", 1, "home"),
        ("Мировая растяжка", "bodyweight", 2, "home"),
        ("Растяжка грудных у дверного проёма", "bodyweight", 1, "home"),
        ("Мобилизация плеч с резинкой", "bands", 1, "home"),
        ("Наклоны к носкам", "bodyweight", 1, "home"),
    ],
    "full_body": [
        ("Присед с жимом над головой", "dumbbells", 3, "home"),
        ("Махи гирей", "kettlebell", 3, "gym"),
        ("Комплекс присед + жим", "dumbbells", 2, "home"),
        ("Фермерская прогулка", "dumbbells", 2, "gym"),
        ("Присед + жим гантелей", "dumbbells", 2, "home"),
        ("Выпад + сгибание на бицепс", "dumbbells", 2, "home"),
        ("Планка с касанием плеч", "bodyweight", 2, "home"),
        ("Обратные выпады с поворотом", "bodyweight", 2, "home"),
        ("Медвежья походка", "bodyweight", 2, "home"),
    ],
}

YT = {
    "Приседания со своим весом": "https://www.youtube.com/watch?v=aclHkVaku9U",
    "Отжимания от пола": "https://www.youtube.com/watch?v=IODxDxX7oi4",
    "Планка": "https://www.youtube.com/watch?v=ASdvN_XEl_c",
    "Подтягивания": "https://www.youtube.com/watch?v=eGo4IYlbE5g",
    "Жим штанги лёжа": "https://www.youtube.com/watch?v=rT7DgCr-3pg",
    "Становая тяга классическая": "https://www.youtube.com/watch?v=op9kVnSso6Q",
    "Румынская тяга": "https://www.youtube.com/watch?v=jEy_czb3RKA",
    "Бёрпи": "https://www.youtube.com/watch?v=TU8QYVW0gDU",
    "Выпады вперёд": "https://www.youtube.com/watch?v=QOVaHwm-Q6U",
    "Жим гантелей сидя": "https://www.youtube.com/watch?v=qEwKCR5JCog",
    "Тяга гантели в наклоне": "https://www.youtube.com/watch?v=pYcpY20QaE8",
    "Сгибания гантелей на бицепс": "https://www.youtube.com/watch?v=ykJmrZ5v0Oo",
    "Разгибания на блоке": "https://www.youtube.com/watch?v=2-LAMcpzODU",
    "Ягодичный мост": "https://www.youtube.com/watch?v=OUgsJ8-Vi0E",
    "Тяга к лицу": "https://www.youtube.com/watch?v=rep-qVOkqgk",
    "Кошка-корова": "https://www.youtube.com/watch?v=kqnua4rHVVA",
    "Альпинисты": "https://www.youtube.com/watch?v=nmwgirgXLYM",
    "Прыжки «звездой»": "https://www.youtube.com/watch?v=iSSAk4XCsRA",
    "Жим ногами": "https://www.youtube.com/watch?v=IZxyjW7MPJQ",
    "Гиперэкстензия": "https://www.youtube.com/watch?v=ph3pddpKzzw",
    "Отжимания на брусьях": "https://www.youtube.com/watch?v=2z8JmcrW-As",
    "Тяга верхнего блока": "https://www.youtube.com/watch?v=CAwf7n6Luuc",
    "Разводка гантелей в стороны": "https://www.youtube.com/watch?v=3VcKaXpzqRo",
    "Мёртвый жук": "https://www.youtube.com/watch?v=4XLEnwUr1d8",
    "Птица-собака": "https://www.youtube.com/watch?v=wiFNA3sqjCA",
    "Ягодичный мост со штангой": "https://www.youtube.com/watch?v=LM8XHLYJoYs",
    "Болгарские выпады": "https://www.youtube.com/watch?v=2C-uNgKwPLE",
    "Французский жим гантели": "https://www.youtube.com/watch?v=nRiJVZDpdL0",
    "Молотковые сгибания": "https://www.youtube.com/watch?v=zC3nLlEvin4",
    "Мировая растяжка": "https://www.youtube.com/watch?v=oNzynUF41kA",
    "Махи гирей": "https://www.youtube.com/watch?v=YSxHifyI6s8",
    "Махи гирей": "https://www.youtube.com/watch?v=YSxHifyI6s8",
    "Фермерская прогулка": "https://www.youtube.com/watch?v=Fkzk_RqlYig",
}

TECH = {
    "ноги": "Стопы устойчивы, колени по носкам, корпус нейтральный, движение контролируемое.",
    "грудь": "Лопатки сведены, локти под контролем, полная амплитуда без боли в плечах.",
    "спина": "Нейтральная поясница, тяга локтями, без рывка корпусом.",
    "плечи": "Не задирайте плечи к ушам, контролируйте негативную фазу.",
    "бицепс": "Локти зафиксированы, без раскачки корпуса.",
    "трицепс": "Плечи стабильны, разгибание в локте без разведения локтей в стороны.",
    "кор": "Дышите ровно, не проваливайте поясницу, держите рёбра нейтрально.",
    "кардио": "Держите ровный ритм, при усталости снижайте интенсивность, не жертвуйте техникой.",
    "мобильность": "Двигайтесь в комфортном диапазоне, без резкой боли, дыхание спокойное.",
    "full_body": "Держите корпус собранным, выбирайте вес, который позволяет чистую технику во всех фазах.",
}

MIST = {
    "ноги": "Колени заваливаются внутрь; округление поясницы; отрыв пяток.",
    "грудь": "Провисание поясницы; неполная амплитуда; разведённые локти на 90°.",
    "спина": "Рывок корпусом; скругление спины; тяга бицепсом вместо спины.",
    "плечи": "Читинг корпусом; слишком большой вес; подъём трапецией.",
    "бицепс": "Раскачка; локти уезжают вперёд; неполная амплитуда.",
    "трицепс": "Разведение локтей; работа плечами; рывок.",
    "кор": "Прогиб поясницы; задержка дыхания; шея в напряжении.",
    "кардио": "Слишком высокий темп с потерей техники; задержка дыхания.",
    "full_body": "Потеря нейтрали корпуса; слишком тяжёлый вес; торопливые повторы.",
    "мобильность": "Резкие рывки; работа через острую боль.",
}


def day(idx: int, name: str, focus: str, names: list[str], sets: int = 3, reps: str = "8-12", rest: int = 75) -> dict:
    return {
        "day_index": idx,
        "name": name,
        "focus": focus,
        "exercises": [
            {"exercise_name": n, "sets": sets, "reps": reps, "rest_sec": rest} for n in names
        ],
    }


def main() -> None:
    exercises: list[dict] = []
    for muscle_group, items in GROUPS.items():
        for name, equipment, difficulty, tag in items:
            url = YT.get(name)
            exercises.append(
                {
                    "name_ru": name,
                    "muscle_group": muscle_group,
                    "equipment": equipment,
                    "description": f"Упражнение на группу «{muscle_group}».",
                    "technique": TECH[muscle_group],
                    "common_mistakes": MIST[muscle_group],
                    "difficulty": difficulty,
                    "video_url": url,
                    "animation_url": None,
                    "thumbnail_url": None,
                    "media_duration_sec": None,
                    "media_source": "youtube" if url else "none",
                    "tags": [tag, muscle_group],
                }
            )

    if len(exercises) != 100:
        raise SystemExit(f"expected 100 exercises, got {len(exercises)}")

    programs = [
        {
            "name": "Full Body Beginner 3 дня",
            "description": "Базовая full body программа для новичков дома/зале.",
            "target_level": "beginner",
            "level": "beginner",
            "workout_type": "full_body",
            "duration_weeks": 4,
            "is_template": True,
            "structure": {
                "workout_type": "full_body",
                "level": "beginner",
                "days_per_week": 3,
                "session_duration_min": 40,
                "schedule": [
                    day(
                        1,
                        "Full Body A",
                        "full",
                        [
                            "Приседания со своим весом",
                            "Отжимания от пола",
                            "Тяга гантели в наклоне",
                            "Планка",
                            "Ягодичный мост",
                            "Разводка гантелей в стороны",
                        ],
                    ),
                    day(
                        2,
                        "Full Body B",
                        "full",
                        [
                            "Выпады вперёд",
                            "Отжимания с возвышения",
                            "Тяга резинки к поясу",
                            "Мёртвый жук",
                            "Подъёмы на носки стоя",
                            "Сгибания гантелей на бицепс",
                        ],
                    ),
                    day(
                        3,
                        "Full Body C",
                        "full",
                        [
                            "Приседания с гантелью у груди",
                            "Жим гантелей лёжа",
                            "Австралийские подтягивания",
                            "Боковая планка",
                            "Румынская тяга с гантелями",
                            "Разгибания гантели из-за головы",
                        ],
                    ),
                ],
            },
        },
        {
            "name": "Full Body A/B Intermediate",
            "description": "Чередование full body A/B для среднего уровня.",
            "target_level": "intermediate",
            "level": "intermediate",
            "workout_type": "full_body_alt",
            "duration_weeks": 6,
            "is_template": True,
            "structure": {
                "workout_type": "full_body_alt",
                "days_per_week": 4,
                "schedule": [
                    day(
                        1,
                        "Full Body A",
                        "full",
                        [
                            "Приседания со штангой",
                            "Жим штанги лёжа",
                            "Тяга штанги в наклоне",
                            "Планка",
                            "Тяга к лицу",
                            "Французский жим гантели",
                        ],
                        sets=4,
                        reps="6-10",
                        rest=90,
                    ),
                    day(
                        2,
                        "Full Body B",
                        "full",
                        [
                            "Румынская тяга",
                            "Жим гантелей сидя",
                            "Подтягивания",
                            "Ягодичный мост со штангой",
                            "Молотковые сгибания",
                            "Альпинисты",
                        ],
                        sets=4,
                        reps="6-10",
                        rest=90,
                    ),
                ],
            },
        },
        {
            "name": "Upper/Lower 4 дня",
            "description": "Сплит верх/низ 4 тренировки в неделю.",
            "target_level": "intermediate",
            "level": "intermediate",
            "workout_type": "upper_lower",
            "duration_weeks": 8,
            "is_template": True,
            "structure": {
                "workout_type": "upper_lower",
                "days_per_week": 4,
                "schedule": [
                    day(
                        1,
                        "Upper A",
                        "upper",
                        [
                            "Жим штанги лёжа",
                            "Тяга верхнего блока",
                            "Жим гантелей сидя",
                            "Тяга гантели в наклоне",
                            "Сгибания гантелей на бицепс",
                            "Разгибания на блоке",
                        ],
                        rest=90,
                    ),
                    day(
                        2,
                        "Lower A",
                        "lower",
                        [
                            "Приседания со штангой",
                            "Румынская тяга",
                            "Выпады назад с гантелями",
                            "Подъёмы на носки стоя",
                            "Планка",
                        ],
                        rest=90,
                    ),
                    day(
                        3,
                        "Upper B",
                        "upper",
                        [
                            "Жим гантелей на наклонной",
                            "Тяга горизонтального блока",
                            "Разводка гантелей в стороны",
                            "Тяга к лицу",
                            "Молотковые сгибания",
                            "Отжимания узким хватом",
                        ],
                        rest=90,
                    ),
                    day(
                        4,
                        "Lower B",
                        "lower",
                        [
                            "Жим ногами",
                            "Болгарские выпады",
                            "Сгибания ног лёжа",
                            "Ягодичный мост",
                            "Мёртвый жук",
                        ],
                        rest=90,
                    ),
                ],
            },
        },
        {
            "name": "Push Pull Legs 3 дня",
            "description": "Классический PPL beginner/intermediate 3 дня.",
            "target_level": "beginner",
            "level": "beginner",
            "workout_type": "push_pull_legs",
            "duration_weeks": 6,
            "is_template": True,
            "structure": {
                "workout_type": "push_pull_legs",
                "days_per_week": 3,
                "schedule": [
                    day(
                        1,
                        "Push",
                        "push",
                        [
                            "Жим гантелей лёжа",
                            "Жим гантелей сидя",
                            "Отжимания от пола",
                            "Разводка гантелей в стороны",
                            "Разгибания гантели из-за головы",
                        ],
                    ),
                    day(
                        2,
                        "Pull",
                        "pull",
                        [
                            "Тяга гантели в наклоне",
                            "Тяга верхнего блока",
                            "Тяга к лицу",
                            "Сгибания гантелей на бицепс",
                            "Птица-собака",
                        ],
                    ),
                    day(
                        3,
                        "Legs",
                        "legs",
                        [
                            "Приседания с гантелью у груди",
                            "Румынская тяга с гантелями",
                            "Выпады вперёд",
                            "Подъёмы на носки стоя",
                            "Планка",
                        ],
                    ),
                ],
            },
        },
        {
            "name": "Push Pull Legs 6 дней",
            "description": "PPL advanced template 6 дней (A/B).",
            "target_level": "advanced",
            "level": "advanced",
            "workout_type": "push_pull_legs",
            "duration_weeks": 8,
            "is_template": True,
            "structure": {
                "workout_type": "push_pull_legs",
                "days_per_week": 6,
                "schedule": [
                    day(
                        1,
                        "Push A",
                        "push",
                        [
                            "Жим штанги лёжа",
                            "Жим гантелей на наклонной",
                            "Жим гантелей сидя",
                            "Разводка гантелей в стороны",
                            "Разгибания на блоке",
                        ],
                        sets=4,
                        rest=100,
                    ),
                    day(
                        2,
                        "Pull A",
                        "pull",
                        [
                            "Подтягивания",
                            "Тяга штанги в наклоне",
                            "Тяга горизонтального блока",
                            "Тяга к лицу",
                            "Сгибания со штангой",
                        ],
                        sets=4,
                        rest=100,
                    ),
                    day(
                        3,
                        "Legs A",
                        "legs",
                        [
                            "Приседания со штангой",
                            "Румынская тяга",
                            "Жим ногами",
                            "Подъёмы на носки сидя",
                            "Планка",
                        ],
                        sets=4,
                        rest=100,
                    ),
                    day(
                        4,
                        "Push B",
                        "push",
                        [
                            "Жим в тренажёре",
                            "Отжимания на брусьях",
                            "Жим Арнольда",
                            "Сведение рук в кроссовере",
                            "Французский жим гантели",
                        ],
                        sets=4,
                        rest=100,
                    ),
                    day(
                        5,
                        "Pull B",
                        "pull",
                        [
                            "Тяга верхнего блока",
                            "Тяга гантели в наклоне",
                            "Пуловер с гантелью",
                            "Шраги с гантелями",
                            "Молотковые сгибания",
                        ],
                        sets=4,
                        rest=100,
                    ),
                    day(
                        6,
                        "Legs B",
                        "legs",
                        [
                            "Фронтальные приседания",
                            "Болгарские выпады",
                            "Сгибания ног лёжа",
                            "Ягодичный мост со штангой",
                            "Удержание «лодочки»",
                        ],
                        sets=4,
                        rest=100,
                    ),
                ],
            },
        },
        {
            "name": "Home Bodyweight 3 дня",
            "description": "Домашняя программа без оборудования.",
            "target_level": "beginner",
            "level": "beginner",
            "workout_type": "home_express",
            "duration_weeks": 4,
            "is_template": True,
            "structure": {
                "workout_type": "home_express",
                "days_per_week": 3,
                "session_duration_min": 30,
                "schedule": [
                    day(
                        1,
                        "Home A",
                        "full",
                        [
                            "Приседания со своим весом",
                            "Отжимания от пола",
                            "Австралийские подтягивания",
                            "Выпады вперёд",
                            "Планка",
                            "Прыжки «звездой»",
                        ],
                        rest=45,
                    ),
                    day(
                        2,
                        "Home B",
                        "full",
                        [
                            "Сумо-приседания",
                            "Отжимания с колен",
                            "Птица-собака",
                            "Ягодичный мост",
                            "Альпинисты",
                            "Боковая планка",
                        ],
                        rest=45,
                    ),
                    day(
                        3,
                        "Home C",
                        "full",
                        [
                            "Зашагивания на тумбу",
                            "Отжимания узким хватом",
                            "Мёртвый жук",
                            "Бёрпи",
                            "Скручивания",
                            "Кошка-корова",
                        ],
                        rest=45,
                    ),
                ],
            },
        },
        {
            "name": "Strength 3 дня",
            "description": "Силовой акцент на базовые движения.",
            "target_level": "intermediate",
            "level": "intermediate",
            "workout_type": "strength",
            "duration_weeks": 8,
            "is_template": True,
            "structure": {
                "workout_type": "strength",
                "days_per_week": 3,
                "schedule": [
                    day(
                        1,
                        "Squat day",
                        "legs",
                        ["Приседания со штангой", "Жим ногами", "Болгарские выпады", "Планка"],
                        sets=5,
                        reps="5",
                        rest=150,
                    ),
                    day(
                        2,
                        "Bench day",
                        "push",
                        [
                            "Жим штанги лёжа",
                            "Жим гантелей на наклонной",
                            "Отжимания на брусьях",
                            "Разгибания на блоке",
                        ],
                        sets=5,
                        reps="5",
                        rest=150,
                    ),
                    day(
                        3,
                        "Deadlift day",
                        "pull",
                        [
                            "Становая тяга классическая",
                            "Тяга штанги в наклоне",
                            "Подтягивания",
                            "Тяга к лицу",
                        ],
                        sets=5,
                        reps="5",
                        rest=150,
                    ),
                ],
            },
        },
        {
            "name": "Mobility + Core",
            "description": "Восстановление, мобильность и кор 2-3 раза в неделю.",
            "target_level": "beginner",
            "level": "beginner",
            "workout_type": "mobility",
            "duration_weeks": 4,
            "is_template": True,
            "structure": {
                "workout_type": "mobility",
                "days_per_week": 3,
                "session_duration_min": 25,
                "schedule": [
                    day(
                        1,
                        "Mobility A",
                        "mobility",
                        [
                            "Кошка-корова",
                            "Мировая растяжка",
                            "Растяжка сгибателей бедра",
                            "Мёртвый жук",
                            "Планка",
                            "Мобилизация голеностопа",
                        ],
                        sets=2,
                        reps="8-12",
                        rest=30,
                    ),
                    day(
                        2,
                        "Core focus",
                        "core",
                        [
                            "Птица-собака",
                            "Удержание «лодочки»",
                            "Боковая планка",
                            "Велосипед",
                            "Поза голубя",
                            "Раскрытие грудного отдела у стены",
                        ],
                        sets=2,
                        reps="8-12",
                        rest=30,
                    ),
                    day(
                        3,
                        "Mobility B",
                        "mobility",
                        [
                            "Вращения таза",
                            "Растяжка грушевидной",
                            "Кошка-корова",
                            "Ягодичный мост",
                            "Скручивания",
                            "Мировая растяжка",
                        ],
                        sets=2,
                        reps="8-12",
                        rest=30,
                    ),
                ],
            },
        },
    ]

    names = {item["name_ru"] for item in exercises}
    missing: list[str] = []
    for program in programs:
        for schedule_day in program["structure"]["schedule"]:
            for ex in schedule_day["exercises"]:
                if ex["exercise_name"] not in names:
                    missing.append(ex["exercise_name"])
    if missing:
        raise SystemExit(f"missing exercise names: {sorted(set(missing))}")

    (OUT / "exercises.json").write_text(
        json.dumps(exercises, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUT / "programs.json").write_text(
        json.dumps(programs, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    with_video = sum(1 for item in exercises if item.get("video_url"))
    print(f"WROTE exercises={len(exercises)} programs={len(programs)} with_video={with_video}")


if __name__ == "__main__":
    main()
