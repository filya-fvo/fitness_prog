"""Built-in supplement catalog — only items with meaningful evidence for athletes."""

from __future__ import annotations

from typing import Any

# key must be stable — used in user goals.supplements[].key
# evidence: strong | moderate (only these are listed)
SUPPLEMENTS_CATALOG: list[dict[str, Any]] = [
    {
        "key": "creatine_monohydrate",
        "name_ru": "Креатин моногидрат",
        "category": "strength",
        "evidence": "strong",
        "mechanism": (
            "Повышает запасы фосфокреатина в мышцах — быстрее ресинтез ATP "
            "в коротких силовых усилиях."
        ),
        "effects": "Сила, мощность, объём тренировки, восстановление между подходами.",
        "default_dose": "3–5 г",
        "dose_notes": "Ежедневно; загрузка не обязательна. Один из самых изученных эргогенов.",
        "default_times": ["10:00"],
        "recommended": True,
        "with_food": False,
    },
    {
        "key": "caffeine",
        "name_ru": "Кофеин",
        "category": "stimulant",
        "evidence": "strong",
        "mechanism": "Антагонист аденозина — бодрость, снижение воспринимаемой нагрузки.",
        "effects": "Сила, мощность, выносливость, фокус на тренировке.",
        "default_dose": "3–6 мг/кг (часто 150–300 мг)",
        "dose_notes": "За 30–60 мин до тренировки. Не поздно вечером; толерантность растёт.",
        "default_times": ["pre_workout"],
        "recommended": True,
        "with_food": False,
    },
    {
        "key": "whey_protein",
        "name_ru": "Сывороточный протеин",
        "category": "protein",
        "evidence": "strong",
        "mechanism": "Быстрый полноценный белок для закрытия дневной нормы белка.",
        "effects": "Удобный белок, восстановление, набор/удержание мышц (как еда, не «магия»).",
        "default_dose": "20–40 г",
        "dose_notes": "Когда не хватает белка с обычной еды; после тренировки — по удобству.",
        "default_times": ["post_workout"],
        "recommended": True,
        "with_food": False,
    },
    {
        "key": "casein_protein",
        "name_ru": "Казеиновый протеин",
        "category": "protein",
        "evidence": "moderate",
        "mechanism": "Медленный белок; дольше поддерживает аминокислоты в крови.",
        "effects": "Удобный белок на ночь или между приёмами пищи.",
        "default_dose": "20–40 г",
        "dose_notes": "Альтернатива сыворотке; эффект = белок, не уникальный «ночной анаболизм».",
        "default_times": ["21:30"],
        "recommended": False,
        "with_food": False,
    },
    {
        "key": "beta_alanine",
        "name_ru": "Бета-аланин",
        "category": "endurance",
        "evidence": "moderate",
        "mechanism": "Предшественник карнозина — буфер H+ в мышцах при усилиях ~1–4 мин.",
        "effects": "Выносливость в средне-длительных подходах / интервалах.",
        "default_dose": "3–5 г/сут",
        "dose_notes": "Эффект накопительный (2–4 нед.). Делить дозу из‑за парестезий.",
        "default_times": ["09:00", "18:00"],
        "recommended": True,
        "with_food": True,
    },
    {
        "key": "l_citrulline",
        "name_ru": "L-цитруллин (малат)",
        "category": "pump",
        "evidence": "moderate",
        "mechanism": "→ аргинин → NO; кровоток и переносимость объёма.",
        "effects": "Памп, чуть выше объём/повторы у части людей.",
        "default_dose": "6–8 г цитруллина малата (или ~3–6 г L-цитруллина)",
        "dose_notes": "За 30–60 мин до тренировки.",
        "default_times": ["pre_workout"],
        "recommended": True,
        "with_food": False,
    },
    {
        "key": "dietary_nitrate",
        "name_ru": "Нитраты (свёкла / nitrate)",
        "category": "endurance",
        "evidence": "moderate",
        "mechanism": "NO-путь через нитрат→нитрит; экономия кислорода на выносливости.",
        "effects": "Аэробная выносливость, иногда повторные спринты.",
        "default_dose": "~6–8 ммоль нитрата (сок свёклы по этикетке)",
        "dose_notes": "За 2–3 ч до нагрузки. Сильнее для endurance, чем для чистой силы.",
        "default_times": ["pre_workout"],
        "recommended": False,
        "with_food": False,
    },
    {
        "key": "sodium_bicarbonate",
        "name_ru": "Бикарбонат натрия",
        "category": "buffer",
        "evidence": "moderate",
        "mechanism": "Внеклеточный буфер H+ — короткие высокоинтенсивные усилия.",
        "effects": "Повторные спринты / усилия 1–7 мин у части атлетов.",
        "default_dose": "0.2–0.3 г/кг (осторожно с ЖКТ)",
        "dose_notes": "Только при переносимости; риск тошноты. Не на каждый день новичкам.",
        "default_times": ["pre_workout"],
        "recommended": False,
        "with_food": True,
    },
    {
        "key": "omega3",
        "name_ru": "Омега-3 (EPA/DHA)",
        "category": "health",
        "evidence": "moderate",
        "mechanism": "EPA/DHA — мембраны, противовоспалительный фон.",
        "effects": "Общее здоровье ССС; косвенно восстановление при низком рыбе в рационе.",
        "default_dose": "1–2 г EPA+DHA",
        "dose_notes": "С едой, содержащей жир. Не замена тренировке.",
        "default_times": ["13:00"],
        "recommended": True,
        "with_food": True,
    },
    {
        "key": "vitamin_d3",
        "name_ru": "Витамин D3",
        "category": "health",
        "evidence": "strong",
        "mechanism": "При дефиците — кости, иммунитет, мышечная функция.",
        "effects": "Имеет смысл при низком 25(OH)D; без дефицита прирост силы маловероятен.",
        "default_dose": "1000–2000 МЕ (по анализам)",
        "dose_notes": "С жирной едой. Дозу сверять с анализами.",
        "default_times": ["09:30"],
        "recommended": True,
        "with_food": True,
    },
    {
        "key": "magnesium",
        "name_ru": "Магний (глицинат/цитрат)",
        "category": "recovery",
        "evidence": "moderate",
        "mechanism": "Кофактор ферментов, нервно-мышечная передача; эффект ясен при нехватке.",
        "effects": "Сон/судороги при дефиците; не «бустер тестостерона» у всех.",
        "default_dose": "200–400 мг элементарного Mg",
        "dose_notes": "Вечером; осторожно при болезнях почек.",
        "default_times": ["21:00"],
        "recommended": True,
        "with_food": True,
    },
    {
        "key": "electrolytes",
        "name_ru": "Электролиты (Na/K/Mg)",
        "category": "hydration",
        "evidence": "moderate",
        "mechanism": "Восполнение солей при сильном потоотделении.",
        "effects": "Меньше судорог и падения работоспособности в жарких/длинных сессиях.",
        "default_dose": "по этикетке / 1 порция",
        "default_times": ["during_workout"],
        "dose_notes": "Имеет смысл при обильном поте, не обязательно на каждой силовой.",
        "recommended": False,
        "with_food": False,
    },
    {
        "key": "melatonin",
        "name_ru": "Мелатонин",
        "category": "sleep",
        "evidence": "moderate",
        "mechanism": "Сигнал «ночи» для циркадных ритмов; помогает при сдвиге сна/джете.",
        "effects": "Засыпание при нарушенном ритме; не прямой анаболик.",
        "default_dose": "0.5–3 мг",
        "dose_notes": "За 30–60 мин до сна. Не разгонять дозу без нужды.",
        "default_times": ["22:30"],
        "recommended": False,
        "with_food": False,
    },
]


def catalog_by_key() -> dict[str, dict[str, Any]]:
    return {item["key"]: item for item in SUPPLEMENTS_CATALOG}


def recommended_user_entries() -> list[dict[str, Any]]:
    """Optional suggestions for UI — NOT auto-applied to new users."""
    out: list[dict[str, Any]] = []
    for item in SUPPLEMENTS_CATALOG:
        if not item.get("recommended"):
            continue
        out.append(user_entry_from_catalog(item))
    return out


def user_entry_from_catalog(item: dict[str, Any], *, custom: bool = False) -> dict[str, Any]:
    times = list(item.get("default_times") or ["10:00"])
    schedule = [{"slot": str(t), "days": "every"} for t in times if str(t).strip()]
    return {
        "id": item["key"] if not custom else f"custom_{item['key']}",
        "key": item["key"],
        "name_ru": item["name_ru"],
        "dose": item.get("default_dose") or "",
        "times": times,
        "schedule": schedule,
        "enabled": True,
        "custom": custom,
        "notes": "",
    }
