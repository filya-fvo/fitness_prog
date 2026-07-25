"""Built-in supplement catalog (recommendations + picker)."""

from __future__ import annotations

from typing import Any

# key must be stable — used in user goals.supplements[].key
SUPPLEMENTS_CATALOG: list[dict[str, Any]] = [
    {
        "key": "creatine_monohydrate",
        "name_ru": "Креатин моногидрат",
        "category": "strength",
        "mechanism": (
            "Повышает запасы фосфокреатина в мышцах — быстрее ресинтез ATP "
            "в коротких силовых усилиях."
        ),
        "effects": "Сила, мощность, объём тренировки, восстановление между подходами.",
        "default_dose": "5 г",
        "dose_notes": "Ежедневно, в любой время; в дни без тренировок тоже. Загрузка не обязательна.",
        "default_times": ["10:00"],
        "recommended": True,
        "with_food": False,
    },
    {
        "key": "beta_alanine",
        "name_ru": "Бета-аланин",
        "category": "endurance",
        "mechanism": (
            "Предшественник карнозина — буфер H+ в мышцах, отсрочка жжения "
            "в подходах 30–120 сек."
        ),
        "effects": "Выносливость в средне-длительных подходах, больше качественного объёма.",
        "default_dose": "3–5 г/сут",
        "dose_notes": "Делить на 2 приёма, чтобы снизить парестезии (покалывание).",
        "default_times": ["09:00", "18:00"],
        "recommended": True,
        "with_food": True,
    },
    {
        "key": "l_citrulline",
        "name_ru": "L-цитруллин (малат)",
        "category": "pump",
        "mechanism": (
            "Превращается в аргинин → NO, улучшает кровоток и доставку нутриентов "
            "к работающим мышцам."
        ),
        "effects": "Памп, переносимость объёма, субъективная «лёгкость» подхода.",
        "default_dose": "6–8 г цитруллина малата",
        "dose_notes": "За 30–45 мин до тренировки.",
        "default_times": ["pre_workout"],
        "recommended": True,
        "with_food": False,
    },
    {
        "key": "whey_protein",
        "name_ru": "Сывороточный протеин",
        "category": "protein",
        "mechanism": "Быстрый полноценный белок для закрытия дневной нормы белка.",
        "effects": "Удобный белок, восстановление, набор/удержание мышц.",
        "default_dose": "20–40 г",
        "dose_notes": "В приём пищи или после тренировки, если не хватает белка с еды.",
        "default_times": ["post_workout"],
        "recommended": True,
        "with_food": False,
    },
    {
        "key": "omega3",
        "name_ru": "Омега-3 (EPA/DHA)",
        "category": "health",
        "mechanism": "Жирные кислоты EPA/DHA — противовоспалительный фон, мембраны клеток.",
        "effects": "Суставы, восстановление, общее здоровье сердечно-сосудистой системы.",
        "default_dose": "1–2 г EPA+DHA",
        "dose_notes": "С едой, содержащей жир.",
        "default_times": ["13:00"],
        "recommended": True,
        "with_food": True,
    },
    {
        "key": "vitamin_d3",
        "name_ru": "Витамин D3",
        "category": "health",
        "mechanism": "Гормоноподобный витамин: кости, иммунитет, мышечная функция.",
        "effects": "При дефиците — энергия, иммунитет, поддержка силовых.",
        "default_dose": "1000–2000 МЕ (по анализам)",
        "dose_notes": "С жирной едой. Дозу лучше сверять с 25(OH)D.",
        "default_times": ["09:30"],
        "recommended": False,
        "with_food": True,
    },
    {
        "key": "magnesium",
        "name_ru": "Магний (глицинат/цитрат)",
        "category": "recovery",
        "mechanism": "Кофактор сотен ферментов, нервно-мышечная передача, сон.",
        "effects": "Расслабление, сон, снижение судорог при нехватке.",
        "default_dose": "200–400 мг элементарного Mg",
        "dose_notes": "Вечером; не превышать без консультации при заболеваниях почек.",
        "default_times": ["21:00"],
        "recommended": True,
        "with_food": True,
    },
    {
        "key": "caffeine",
        "name_ru": "Кофеин",
        "category": "stimulant",
        "mechanism": "Антагонист аденозина — бодрость, снижение воспринимаемой нагрузки.",
        "effects": "Фокус и сила/выносливость в тренировке.",
        "default_dose": "3–6 мг/кг (часто 150–300 мг)",
        "dose_notes": "За 30–45 мин до тренировки. Не поздно вечером.",
        "default_times": ["pre_workout"],
        "recommended": False,
        "with_food": False,
    },
    {
        "key": "citrulline_malate_pre",
        "name_ru": "Предтрен (без лишнего стимулятора)",
        "category": "preworkout",
        "mechanism": "Комбо цитруллин + электролиты ± лёгкий кофеин по переносимости.",
        "effects": "Работоспособность и памп на сессии.",
        "default_dose": "по этикетке / 1 порция",
        "dose_notes": "Только в тренировочные дни.",
        "default_times": ["pre_workout"],
        "recommended": False,
        "with_food": False,
    },
    {
        "key": "collagen",
        "name_ru": "Коллаген + витамин C",
        "category": "joints",
        "mechanism": "Пептиды коллагена — строительный материал связок/суставов; C для синтеза.",
        "effects": "Комфорт суставов при регулярных нагрузках (доказательная база умеренная).",
        "default_dose": "10–15 г коллагена + 50 мг C",
        "dose_notes": "За 30–60 мин до нагрузки на связки/сухожилия.",
        "default_times": ["08:30"],
        "recommended": False,
        "with_food": False,
    },
    {
        "key": "electrolytes",
        "name_ru": "Электролиты (Na/K/Mg)",
        "category": "hydration",
        "mechanism": "Восполнение солей при потоотделении.",
        "effects": "Меньше судорог и «ватности» на длинных/жарких сессиях.",
        "default_dose": "по этикетке / 1 порция",
        "default_times": ["during_workout"],
        "dose_notes": "В тренировку или после сильной потливости.",
        "recommended": False,
        "with_food": False,
    },
    {
        "key": "ashwagandha",
        "name_ru": "Ашваганда (KSM-66 и аналоги)",
        "category": "adaptogen",
        "mechanism": "Адаптоген; может снижать субъективный стресс и кортизол у части людей.",
        "effects": "Стресс, сон, иногда силовые показатели при хроническом стрессе.",
        "default_dose": "300–600 мг экстракта",
        "dose_notes": "Курсами; обсудить с врачом при заболеваниях щитовидной железы.",
        "default_times": ["21:00"],
        "recommended": False,
        "with_food": True,
    },
]


def catalog_by_key() -> dict[str, dict[str, Any]]:
    return {item["key"]: item for item in SUPPLEMENTS_CATALOG}


def recommended_user_entries() -> list[dict[str, Any]]:
    """Default stack pushed to new users / « ent recommendations»."""
    out: list[dict[str, Any]] = []
    for item in SUPPLEMENTS_CATALOG:
        if not item.get("recommended"):
            continue
        out.append(user_entry_from_catalog(item))
    return out


def user_entry_from_catalog(item: dict[str, Any], *, custom: bool = False) -> dict[str, Any]:
    return {
        "id": item["key"] if not custom else f"custom_{item['key']}",
        "key": item["key"],
        "name_ru": item["name_ru"],
        "dose": item.get("default_dose") or "",
        "times": list(item.get("default_times") or ["10:00"]),
        "enabled": True,
        "custom": custom,
        "notes": "",
    }
