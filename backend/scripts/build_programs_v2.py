# -*- coding: utf-8 -*-
"""Build programs.json v2: sex x location x equipment x level x joint limits.

No warm-up/mobility fillers in gym/outdoor main work.
Exercise names must match scripts/seed_content/exercises.json exactly.
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "seed_content" / "programs.json"

# --- helpers ---

def ex(name: str, sets: int = 3, reps: str = "8-12", rest: int = 75) -> dict:
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
    duration_weeks: int = 6,
    session_min: int = 45,
) -> dict:
    return {
        "name": name,
        "description": description,
        "target_level": level,
        "level": level,
        "workout_type": workout_type,
        "duration_weeks": duration_weeks,
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


# --- building blocks (working sets only) ---

def fb_bw_a(sets=3, reps="8-12", rest=75):
    return [
        ex("Приседания со своим весом", sets, reps, rest),
        ex("Отжимания от пола", sets, reps, rest),
        ex("Австралийские подтягивания", sets, reps, rest),
        ex("Ягодичный мост", sets, reps, rest),
        ex("Планка", sets, "30-45с", rest),
        ex("Отжимания узким хватом", sets, reps, rest),
    ]


def fb_bw_b(sets=3, reps="8-12", rest=75):
    return [
        ex("Выпады вперёд", sets, reps, rest),
        ex("Отжимания с возвышения", sets, reps, rest),
        ex("Планка с касанием плеч", sets, reps, rest),
        ex("Боковая планка", sets, "20-40с", rest),
        ex("Подъёмы на носки стоя", sets, "12-15", rest),
        ex("Мёртвый жук", sets, "8-10/стор", rest),
    ]


def fb_bw_c(sets=3, reps="8-12", rest=75):
    return [
        ex("Боковые выпады", sets, reps, rest),
        ex("Отжимания с колен", sets, reps, rest),
        ex("Птица-собака", sets, "8/стор", rest),
        ex("Ягодичный мост", sets, "12-15", rest),
        ex("Скручивания", sets, "12-15", rest),
        ex("Обратные выпады с поворотом", sets, "8/стор", rest),
    ]


def outdoor_a(sets=3):
    return [
        ex("Приседания со своим весом", sets, "10-15", 60),
        ex("Отжимания от пола", sets, "8-15", 60),
        ex("Австралийские подтягивания", sets, "6-12", 75),
        ex("Выпады вперёд", sets, "8-12/стор", 60),
        ex("Планка", sets, "30-45с", 45),
        ex("Высокие колени", sets, "30с", 45),
    ]


def outdoor_b(sets=3):
    return [
        ex("Боковые выпады", sets, "8-12/стор", 60),
        ex("Отжимания с возвышения", sets, "8-15", 60),
        ex("Медвежья походка", sets, "20-30с", 45),
        ex("Ягодичный мост", sets, "12-15", 45),
        ex("Боковая планка", sets, "20-40с", 45),
        ex("Скейтер-прыжки", sets, "8-12/стор", 45),
    ]


def outdoor_c_bands(sets=3):
    return [
        ex("Приседания со своим весом", sets, "12-15", 60),
        ex("Тяга резинки к поясу", sets, "12-15", 60),
        ex("Отжимания от пола", sets, "8-12", 60),
        ex("Выпады вперёд", sets, "8-12/стор", 60),
        ex("Планка с касанием плеч", sets, "8-12/стор", 45),
        ex("Бёрпи", 2, "6-10", 75),
    ]


def home_female_a(sets=3):
    return [
        ex("Приседания со своим весом", sets, "12-15", 60),
        ex("Ягодичный мост", sets, "12-15", 60),
        ex("Отжимания с возвышения", sets, "8-12", 60),
        ex("Выпады назад с гантелями", sets, "8-12/стор", 60),  # may fallback if no db - use bodyweight lunges name
        ex("Боковая планка", sets, "20-40с", 45),
        ex("Скручивания", sets, "12-15", 45),
    ]


# fix home female without requiring dumbbells for pure bw home
def home_female_a_bw(sets=3):
    return [
        ex("Приседания со своим весом", sets, "12-15", 60),
        ex("Ягодичный мост", sets, "15-20", 45),
        ex("Отжимания с возвышения", sets, "8-12", 60),
        ex("Выпады вперёд", sets, "8-12/стор", 60),
        ex("Боковая планка", sets, "20-40с", 45),
        ex("Скручивания", sets, "12-15", 45),
    ]


def home_female_b_bw(sets=3):
    return [
        ex("Сумо-приседания", sets, "12-15", 60),  # needs dumbbells in catalog - use bodyweight squat variant
        ex("Ягодичный мост", sets, "15-20", 45),
        ex("Отжимания с колен", sets, "8-15", 60),
        ex("Боковые выпады", sets, "8-12/стор", 60),
        ex("Мёртвый жук", sets, "8/стор", 45),
        ex("Подъёмы на носки стоя", sets, "15-20", 40),
    ]


# Sumo squat is dumbbells in catalog - replace with bodyweight
def home_female_b_bw_fixed(sets=3):
    return [
        ex("Приседания со своим весом", sets, "15-20", 60),
        ex("Ягодичный мост", sets, "15-20", 45),
        ex("Отжимания с колен", sets, "8-15", 60),
        ex("Боковые выпады", sets, "8-12/стор", 60),
        ex("Мёртвый жук", sets, "8/стор", 45),
        ex("Подъёмы на носки стоя", sets, "15-20", 40),
    ]


def home_female_c_bw(sets=3):
    return [
        ex("Обратные выпады с поворотом", sets, "8/стор", 60),
        ex("Ягодичный мост", sets, "12-15", 45),
        ex("Отжимания от пола", sets, "6-12", 60),
        ex("Птица-собака", sets, "8/стор", 45),
        ex("Планка", sets, "30-45с", 45),
        ex("Русские скручивания", sets, "12-16", 45),
    ]


def gym_male_beg_a(sets=3, reps="8-12", rest=75):
    return [
        ex("Жим ногами", sets, reps, rest),
        ex("Жим в тренажёре", sets, reps, rest),
        ex("Тяга верхнего блока", sets, reps, rest),
        ex("Жим гантелей сидя", sets, reps, rest),
        ex("Сгибания гантелей на бицепс", sets, reps, rest),
        ex("Планка", sets, "30-45с", 60),
    ]


def gym_male_beg_b(sets=3, reps="8-12", rest=75):
    return [
        ex("Приседания с гантелью у груди", sets, reps, rest),
        ex("Жим гантелей лёжа", sets, reps, rest),
        ex("Тяга горизонтального блока", sets, reps, rest),
        ex("Разводка гантелей в стороны", sets, reps, rest),
        ex("Разгибания на блоке", sets, reps, rest),
        ex("Скручивания", sets, "12-15", 60),
    ]


def gym_male_beg_c(sets=3, reps="8-12", rest=75):
    return [
        ex("Румынская тяга с гантелями", sets, reps, rest),
        ex("Жим гантелей на наклонной", sets, reps, rest),
        ex("Тяга гантели в наклоне", sets, reps, rest),
        ex("Ягодичный мост", sets, "10-15", rest),
        ex("Молотковые сгибания", sets, reps, rest),
        ex("Боковая планка", sets, "20-40с", 60),
    ]


def gym_female_beg_a(sets=3, reps="10-15", rest=70):
    return [
        ex("Жим ногами", sets, reps, rest),
        ex("Ягодичный мост со штангой", sets, reps, rest),
        ex("Тяга верхнего блока", sets, reps, rest),
        ex("Жим гантелей сидя", sets, reps, rest),
        ex("Разгибания ног", sets, reps, rest),
        ex("Планка", sets, "30-45с", 55),
    ]


def gym_female_beg_b(sets=3, reps="10-15", rest=70):
    return [
        ex("Приседания с гантелью у груди", sets, reps, rest),
        ex("Ягодичный мост", sets, "12-15", rest),
        ex("Тяга горизонтального блока", sets, reps, rest),
        ex("Жим гантелей лёжа", sets, reps, rest),
        ex("Сгибания ног лёжа", sets, reps, rest),
        ex("Скручивания", sets, "12-15", 55),
    ]


def gym_female_beg_c(sets=3, reps="10-15", rest=70):
    return [
        ex("Болгарские выпады", sets, "8-12/стор", rest),
        ex("Румынская тяга с гантелями", sets, reps, rest),
        ex("Тяга гантели в наклоне", sets, reps, rest),
        ex("Разводка гантелей в стороны", sets, reps, rest),
        ex("Подъёмы на носки сидя", sets, "12-15", 50),
        ex("Боковая планка", sets, "20-40с", 55),
    ]


def gym_male_int_upper(sets=4, reps="6-10", rest=90):
    return [
        ex("Жим штанги лёжа", sets, reps, rest),
        ex("Тяга штанги в наклоне", sets, reps, rest),
        ex("Жим гантелей сидя", sets, reps, rest),
        ex("Тяга верхнего блока", sets, reps, 75),
        ex("Сгибания гантелей на бицепс", 3, "8-12", 60),
        ex("Разгибания на блоке", 3, "8-12", 60),
    ]


def gym_male_int_lower(sets=4, reps="6-10", rest=90):
    return [
        ex("Приседания со штангой", sets, reps, rest),
        ex("Румынская тяга", sets, reps, rest),
        ex("Жим ногами", 3, "8-12", 75),
        ex("Сгибания ног лёжа", 3, "8-12", 60),
        ex("Подъёмы на носки стоя", 3, "10-15", 45),
        ex("Планка", 3, "40-60с", 45),
    ]


def gym_male_int_upper_b(sets=4, reps="6-10", rest=90):
    return [
        ex("Жим гантелей на наклонной", sets, reps, rest),
        ex("Подтягивания", sets, "5-10", rest),
        ex("Жим Арнольда", 3, "8-12", 75),
        ex("Тяга горизонтального блока", sets, reps, 75),
        ex("Молотковые сгибания", 3, "8-12", 60),
        ex("Французский жим гантели", 3, "8-12", 60),
    ]


def gym_male_int_lower_b(sets=4, reps="6-10", rest=90):
    return [
        ex("Фронтальные приседания", sets, reps, rest),
        ex("Болгарские выпады", 3, "8-12/стор", 75),
        ex("Ягодичный мост со штангой", sets, "8-12", 75),
        ex("Разгибания ног", 3, "10-15", 60),
        ex("Подъёмы на носки сидя", 3, "12-15", 45),
        ex("Мёртвый жук", 3, "8/стор", 45),
    ]


def gym_female_int_lower_glute(sets=4, reps="8-12", rest=80):
    return [
        ex("Ягодичный мост со штангой", sets, reps, rest),
        ex("Румынская тяга с гантелями", sets, reps, rest),
        ex("Болгарские выпады", 3, "8-12/стор", 75),
        ex("Сгибания ног лёжа", 3, "10-15", 60),
        ex("Ягодичный мост", 3, "12-15", 45),
        ex("Подъёмы на носки стоя", 3, "12-15", 40),
    ]


def gym_female_int_upper(sets=3, reps="8-12", rest=75):
    return [
        ex("Жим гантелей лёжа", sets, reps, rest),
        ex("Тяга верхнего блока", sets, reps, rest),
        ex("Жим гантелей сидя", sets, reps, rest),
        ex("Тяга гантели в наклоне", sets, reps, rest),
        ex("Разводка гантелей в стороны", sets, reps, 60),
        ex("Разгибания на блоке", sets, reps, 60),
    ]


def gym_female_int_full(sets=3, reps="8-12", rest=75):
    return [
        ex("Приседания с гантелью у груди", sets, reps, rest),
        ex("Жим в тренажёре", sets, reps, rest),
        ex("Тяга горизонтального блока", sets, reps, rest),
        ex("Ягодичный мост со штангой", sets, reps, rest),
        ex("Тяга к лицу", sets, "12-15", 60),
        ex("Планка", sets, "30-45с", 45),
    ]


def gym_adv_push(sets=4, reps="5-8", rest=120):
    return [
        ex("Жим штанги лёжа", sets, reps, rest),
        ex("Жим гантелей на наклонной", sets, "6-10", 90),
        ex("Жим штанги стоя", sets, "5-8", 100),
        ex("Отжимания на брусьях", 3, "6-12", 90),
        ex("Разгибания на блоке", 3, "8-12", 60),
    ]


def gym_adv_pull(sets=4, reps="5-8", rest=120):
    return [
        ex("Становая тяга классическая", sets, reps, rest),
        ex("Подтягивания", sets, "5-10", 100),
        ex("Тяга штанги в наклоне", sets, "5-8", 100),
        ex("Тяга к лицу", 3, "12-15", 60),
        ex("Сгибания со штангой", 3, "6-10", 75),
    ]


def gym_adv_legs(sets=4, reps="5-8", rest=120):
    return [
        ex("Приседания со штангой", sets, reps, rest),
        ex("Румынская тяга", sets, "5-8", 100),
        ex("Жим ногами", 3, "8-12", 90),
        ex("Выпады назад с гантелями", 3, "8-12/стор", 75),
        ex("Подъёмы на носки стоя", 4, "8-12", 45),
    ]


def gym_adv_push_b(sets=4):
    return [
        ex("Жим гантелей лёжа", sets, "6-10", 100),
        ex("Жим Арнольда", sets, "6-10", 90),
        ex("Сведение рук в кроссовере", 3, "10-15", 60),
        ex("Жим лёжа узким хватом", 3, "6-10", 90),
        ex("Разгибания гантели из-за головы", 3, "8-12", 60),
    ]


def gym_adv_pull_b(sets=4):
    return [
        ex("Тяга Т-грифа", sets, "5-8", 100),
        ex("Тяга верхнего блока", sets, "6-10", 90),
        ex("Тяга горизонтального блока", 3, "8-12", 75),
        ex("Шраги с гантелями", 3, "8-12", 60),
        ex("Молотковые сгибания", 3, "8-12", 60),
    ]


def gym_adv_legs_b(sets=4):
    return [
        ex("Фронтальные приседания", sets, "5-8", 110),
        ex("Ягодичный мост со штангой", sets, "6-10", 90),
        ex("Болгарские выпады", 3, "8-12/стор", 75),
        ex("Сгибания ног лёжа", 3, "8-12", 60),
        ex("Подъёмы на носки сидя", 4, "10-15", 45),
    ]


# --- joint-friendly ---

def no_knee_male_a():
    return [
        ex("Жим гантелей лёжа", 4, "6-10", 90),
        ex("Тяга верхнего блока", 4, "6-10", 90),
        ex("Жим гантелей сидя", 3, "8-12", 75),
        ex("Тяга горизонтального блока", 3, "8-12", 75),
        ex("Ягодичный мост со штангой", 4, "8-12", 90),
        ex("Сгибания ног лёжа", 3, "10-15", 60),
        ex("Разгибания на блоке", 3, "8-12", 60),
    ]


def no_knee_male_b():
    return [
        ex("Жим в тренажёре", 4, "6-10", 90),
        ex("Подтягивания", 4, "5-10", 90),
        ex("Жим Арнольда", 3, "8-12", 75),
        ex("Тяга гантели в наклоне", 3, "8-12", 75),
        ex("Ягодичный мост", 4, "10-15", 60),
        ex("Сгибания гантелей на бицепс", 3, "8-12", 60),
        ex("Планка", 3, "30-45с", 45),
    ]


def no_knee_male_c():
    return [
        ex("Жим гантелей на наклонной", 4, "6-10", 90),
        ex("Тяга Т-грифа", 3, "6-10", 90),
        ex("Разводка гантелей в стороны", 3, "10-15", 60),
        ex("Тяга к лицу", 3, "12-15", 60),
        ex("Румынская тяга с гантелями", 3, "8-12", 90),
        ex("Французский жим гантели", 3, "8-12", 60),
        ex("Мёртвый жук", 3, "8/стор", 45),
    ]


def no_knee_female_a():
    return [
        ex("Ягодичный мост со штангой", 4, "8-12", 80),
        ex("Сгибания ног лёжа", 4, "10-15", 60),
        ex("Тяга верхнего блока", 3, "8-12", 75),
        ex("Жим гантелей лёжа", 3, "8-12", 75),
        ex("Ягодичный мост", 3, "12-15", 45),
        ex("Разводка гантелей в стороны", 3, "10-15", 55),
        ex("Планка", 3, "30-45с", 45),
    ]


def no_knee_female_b():
    return [
        ex("Румынская тяга с гантелями", 4, "8-12", 80),
        ex("Жим в тренажёре", 3, "8-12", 75),
        ex("Тяга горизонтального блока", 3, "8-12", 75),
        ex("Ягодичный мост", 4, "12-15", 45),
        ex("Жим гантелей сидя", 3, "8-12", 70),
        ex("Разгибания на блоке", 3, "10-15", 55),
        ex("Боковая планка", 3, "20-40с", 45),
    ]


def no_knee_female_c():
    return [
        ex("Ягодичный мост со штангой", 4, "8-12", 80),
        ex("Тяга гантели в наклоне", 3, "8-12", 75),
        ex("Жим гантелей на наклонной", 3, "8-12", 75),
        ex("Сгибания ног лёжа", 3, "10-15", 60),
        ex("Тяга к лицу", 3, "12-15", 55),
        ex("Сгибания гантелей на бицепс", 3, "10-15", 55),
        ex("Скручивания", 3, "12-15", 45),
    ]


# Home no-knee: no squats/lunges/jumps/step-ups/leg press/extensions.
# Hip hinge + bridge + upper body + core (floor).


def home_no_knee_male_a():
    return [
        ex("Жим гантелей лёжа", 4, "8-12", 75),
        ex("Тяга гантели в наклоне", 4, "8-12", 75),
        ex("Жим гантелей сидя", 3, "8-12", 70),
        ex("Ягодичный мост", 4, "12-15", 55),
        ex("Румынская тяга с гантелями", 3, "8-12", 80),
        ex("Разгибания гантели из-за головы", 3, "10-15", 55),
        ex("Планка", 3, "30-45с", 40),
    ]


def home_no_knee_male_b():
    return [
        ex("Жим гантелей на наклонной", 4, "8-12", 75),
        ex("Австралийские подтягивания", 4, "6-12", 75),
        ex("Разводка гантелей в стороны", 3, "10-15", 55),
        ex("Ягодичный мост", 4, "12-20", 50),
        ex("Сгибания гантелей на бицепс", 3, "8-12", 55),
        ex("Французский жим гантели", 3, "8-12", 55),
        ex("Мёртвый жук", 3, "8/стор", 40),
    ]


def home_no_knee_male_c():
    return [
        ex("Отжимания с возвышения", 3, "8-15", 60),
        ex("Австралийские подтягивания", 4, "6-12", 75),
        ex("Жим Арнольда", 3, "8-12", 70),
        ex("Румынская тяга с гантелями", 3, "8-12", 80),
        ex("Разводка в наклоне", 3, "10-15", 55),
        ex("Молотковые сгибания", 3, "8-12", 55),
        ex("Боковая планка", 3, "20-40с", 40),
    ]


def home_no_knee_female_a():
    return [
        ex("Ягодичный мост", 4, "12-20", 50),
        ex("Румынская тяга с гантелями", 4, "10-15", 70),
        ex("Жим гантелей лёжа", 3, "10-15", 70),
        ex("Тяга гантели в наклоне", 3, "10-15", 70),
        ex("Разводка гантелей в стороны", 3, "12-15", 50),
        ex("Планка", 3, "25-40с", 40),
        ex("Скручивания", 3, "12-15", 40),
    ]


def home_no_knee_female_b():
    return [
        ex("Ягодичный мост", 4, "15-20", 45),
        ex("Жим гантелей сидя", 3, "10-15", 65),
        ex("Тяга гантели в наклоне", 4, "10-15", 65),
        ex("Разведение гантелей лёжа", 3, "12-15", 55),
        ex("Сгибания гантелей на бицепс", 3, "10-15", 50),
        ex("Разгибания гантели из-за головы", 3, "10-15", 50),
        ex("Боковая планка", 3, "15-30с", 40),
    ]


def home_no_knee_female_c():
    return [
        ex("Румынская тяга с гантелями", 4, "10-15", 70),
        ex("Ягодичный мост", 4, "12-20", 45),
        ex("Отжимания с колен", 3, "8-15", 55),
        ex("Тяга гантели в наклоне", 3, "10-15", 65),
        ex("Разводка в наклоне", 3, "12-15", 50),
        ex("Мёртвый жук", 3, "8/стор", 40),
        ex("Русские скручивания", 3, "12-16", 40),
    ]


def home_no_knee_bw_a():
    """Bodyweight-only home, knee-friendly (no lunges/jumps/high knees)."""
    return [
        ex("Отжимания с возвышения", 3, "8-15", 55),
        ex("Австралийские подтягивания", 3, "6-12", 70),
        ex("Ягодичный мост", 4, "15-20", 45),
        ex("Планка", 3, "25-45с", 40),
        ex("Птица-собака", 3, "8/стор", 40),
        ex("Скручивания", 3, "12-15", 40),
    ]


def home_no_knee_bw_b():
    return [
        ex("Отжимания с колен", 3, "8-15", 55),
        ex("Тяга резинки к поясу", 4, "12-15", 50),
        ex("Ягодичный мост", 4, "15-20", 45),
        ex("Боковая планка", 3, "15-30с", 40),
        ex("Мёртвый жук", 3, "8/стор", 40),
        ex("Планка с касанием плеч", 3, "8-12/стор", 40),
    ]


def home_no_knee_bw_c():
    return [
        ex("Отжимания узким хватом", 3, "6-12", 55),
        ex("Австралийские подтягивания", 3, "6-12", 70),
        ex("Ягодичный мост", 4, "12-20", 45),
        ex("Удержание «лодочки»", 3, "20-40с", 40),
        ex("Кошка-корова", 2, "8-10", 30),
        ex("Скручивания", 3, "12-15", 40),
    ]


def home_db_female_a(sets=3, reps="10-15", rest=65):
    return [
        ex("Приседания с гантелью у груди", sets, reps, rest),
        ex("Жим гантелей лёжа", sets, reps, rest),
        ex("Тяга гантели в наклоне", sets, reps, rest),
        ex("Ягодичный мост", sets, "12-20", 50),
        ex("Разводка гантелей в стороны", sets, "12-15", 50),
        ex("Планка", sets, "25-40с", 40),
    ]


def home_db_female_b(sets=3, reps="10-15", rest=65):
    return [
        ex("Румынская тяга с гантелями", sets, reps, rest),
        ex("Жим гантелей сидя", sets, reps, rest),
        ex("Выпады назад с гантелями", sets, "8-12/стор", rest),
        ex("Сгибания гантелей на бицепс", sets, reps, 50),
        ex("Разгибания гантели из-за головы", sets, reps, 50),
        ex("Скручивания", sets, "12-15", 40),
    ]


def home_db_female_c(sets=3, reps="10-15", rest=65):
    return [
        ex("Болгарские выпады", sets, "8-12/стор", rest),
        ex("Жим гантелей на наклонной", sets, reps, rest),
        ex("Тяга гантели в наклоне", sets, reps, rest),
        ex("Ягодичный мост", sets, "15-20", 45),
        ex("Молотковые сгибания", sets, reps, 50),
        ex("Боковая планка", sets, "15-30с", 40),
    ]


def no_spine_beg_male_a():
    return [
        ex("Жим ногами", 3, "10-15", 75),
        ex("Жим в тренажёре", 3, "8-12", 75),
        ex("Тяга верхнего блока", 3, "8-12", 75),
        ex("Жим гантелей сидя", 3, "8-12", 70),
        ex("Разгибания ног", 3, "10-15", 60),
        ex("Сгибания ног лёжа", 3, "10-15", 60),
        ex("Планка", 3, "20-40с", 45),
    ]


def no_spine_beg_male_b():
    return [
        ex("Жим гантелей лёжа", 3, "8-12", 75),
        ex("Тяга горизонтального блока", 3, "8-12", 75),
        ex("Разводка гантелей в стороны", 3, "10-15", 60),
        ex("Жим ногами", 3, "10-15", 75),
        ex("Сгибания гантелей на бицепс", 3, "8-12", 60),
        ex("Разгибания на блоке", 3, "8-12", 60),
        ex("Мёртвый жук", 3, "8/стор", 45),
    ]


def no_spine_beg_male_c():
    return [
        ex("Жим гантелей на наклонной", 3, "8-12", 75),
        ex("Тяга верхнего блока", 3, "8-12", 75),
        ex("Обратные разведения в тренажёре", 3, "10-15", 60),
        ex("Разгибания ног", 3, "10-15", 60),
        ex("Подъёмы на носки сидя", 3, "12-15", 45),
        ex("Молотковые сгибания", 3, "8-12", 60),
        ex("Скручивания", 3, "12-15", 45),
    ]


def no_spine_beg_female_a():
    return [
        ex("Жим ногами", 3, "10-15", 70),
        ex("Ягодичный мост", 3, "12-15", 55),
        ex("Тяга верхнего блока", 3, "10-15", 70),
        ex("Жим гантелей сидя", 3, "10-15", 65),
        ex("Сгибания ног лёжа", 3, "10-15", 55),
        ex("Разводка гантелей в стороны", 3, "10-15", 55),
        ex("Планка", 3, "20-40с", 40),
    ]


def no_spine_beg_female_b():
    return [
        ex("Жим в тренажёре", 3, "8-12", 70),
        ex("Тяга горизонтального блока", 3, "10-15", 70),
        ex("Разгибания ног", 3, "10-15", 55),
        ex("Ягодичный мост", 3, "12-15", 55),
        ex("Жим гантелей лёжа", 3, "8-12", 70),
        ex("Разгибания на блоке", 3, "10-15", 55),
        ex("Мёртвый жук", 3, "8/стор", 40),
    ]


def no_spine_beg_female_c():
    return [
        ex("Жим ногами", 3, "10-15", 70),
        ex("Тяга верхнего блока", 3, "10-15", 70),
        ex("Обратные разведения в тренажёре", 3, "12-15", 55),
        ex("Сгибания ног лёжа", 3, "10-15", 55),
        ex("Сгибания гантелей на бицепс", 3, "10-15", 55),
        ex("Подъёмы на носки сидя", 3, "12-15", 40),
        ex("Скручивания", 3, "12-15", 40),
    ]


def no_spine_int_male_a():
    return [
        ex("Жим ногами", 4, "8-12", 90),
        ex("Жим штанги лёжа", 4, "6-10", 100),
        ex("Тяга верхнего блока", 4, "6-10", 90),
        ex("Жим гантелей сидя", 3, "6-10", 80),
        ex("Сгибания ног лёжа", 3, "8-12", 60),
        ex("Разгибания на блоке", 3, "8-12", 60),
    ]


def no_spine_int_male_b():
    return [
        ex("Жим гантелей на наклонной", 4, "6-10", 90),
        ex("Тяга горизонтального блока", 4, "6-10", 90),
        ex("Разгибания ног", 3, "10-15", 60),
        ex("Жим Арнольда", 3, "8-12", 75),
        ex("Сгибания со штангой", 3, "6-10", 75),
        ex("Тяга к лицу", 3, "12-15", 60),
    ]


def no_spine_int_male_c():
    return [
        ex("Жим в тренажёре", 4, "6-10", 90),
        ex("Подтягивания", 4, "5-10", 90),
        ex("Жим ногами", 3, "8-12", 90),
        ex("Обратные разведения в тренажёре", 3, "10-15", 60),
        ex("Жим лёжа узким хватом", 3, "6-10", 80),
        ex("Планка", 3, "30-45с", 45),
    ]


def no_spine_int_female_a():
    return [
        ex("Жим ногами", 4, "8-12", 80),
        ex("Ягодичный мост", 4, "10-15", 60),
        ex("Тяга верхнего блока", 3, "8-12", 75),
        ex("Жим гантелей лёжа", 3, "8-12", 75),
        ex("Сгибания ног лёжа", 3, "10-15", 55),
        ex("Разводка гантелей в стороны", 3, "10-15", 55),
    ]


def no_spine_int_female_b():
    return [
        ex("Жим в тренажёре", 3, "8-12", 75),
        ex("Тяга горизонтального блока", 4, "8-12", 75),
        ex("Разгибания ног", 3, "10-15", 55),
        ex("Жим гантелей сидя", 3, "8-12", 70),
        ex("Ягодичный мост", 3, "12-15", 50),
        ex("Разгибания на блоке", 3, "10-15", 55),
    ]


def no_spine_int_female_c():
    return [
        ex("Жим ногами", 4, "8-12", 80),
        ex("Тяга верхнего блока", 3, "8-12", 75),
        ex("Сгибания ног лёжа", 3, "10-15", 55),
        ex("Жим гантелей на наклонной", 3, "8-12", 75),
        ex("Тяга к лицу", 3, "12-15", 55),
        ex("Скручивания", 3, "12-15", 45),
    ]


def home_no_spine_a():
    """Home spine-safe: no RDL / bent-over rows; floor press, band rows, bridges."""
    return [
        ex("Жим гантелей лёжа", 3, "8-12", 70),
        ex("Тяга резинки к поясу", 3, "12-15", 60),
        ex("Ягодичный мост", 3, "12-15", 50),
        ex("Жим гантелей сидя", 3, "8-12", 65),
        ex("Отжимания с возвышения", 3, "8-12", 55),
        ex("Мёртвый жук", 3, "8/стор", 40),
    ]


def home_no_spine_b():
    return [
        ex("Жим гантелей на наклонной", 3, "8-12", 70),
        ex("Тяга резинки к поясу", 3, "12-15", 60),
        ex("Ягодичный мост", 3, "15-20", 45),
        ex("Разводка гантелей в стороны", 3, "10-15", 50),
        ex("Молотковые сгибания", 3, "10-15", 50),
        ex("Планка", 3, "20-40с", 40),
    ]


def home_no_spine_c():
    return [
        ex("Отжимания от пола", 3, "8-15", 60),
        ex("Тяга резинки к поясу", 3, "12-15", 60),
        ex("Ягодичный мост", 3, "12-15", 50),
        ex("Жим гантелей сидя", 3, "10-15", 60),
        ex("Разгибания гантели из-за головы", 3, "10-15", 50),
        ex("Скручивания", 3, "12-15", 40),
    ]


def outdoor_no_knee_a():
    """Outdoor without squats/lunges/jumps."""
    return [
        ex("Отжимания от пола", 3, "8-15", 60),
        ex("Австралийские подтягивания", 3, "6-12", 75),
        ex("Ягодичный мост", 3, "12-15", 45),
        ex("Планка", 3, "30-45с", 45),
        ex("Отжимания узким хватом", 3, "6-12", 55),
        ex("Боковая планка", 3, "20-40с", 40),
    ]


def outdoor_no_knee_b():
    return [
        ex("Отжимания с возвышения", 3, "8-15", 60),
        ex("Австралийские подтягивания", 3, "6-12", 75),
        ex("Ягодичный мост", 3, "15-20", 45),
        ex("Медвежья походка", 3, "20-30с", 45),
        ex("Планка с касанием плеч", 3, "8-12/стор", 40),
        ex("Скручивания", 3, "12-15", 35),
    ]


def outdoor_no_knee_c():
    return [
        ex("Отжимания от пола", 3, "8-12", 60),
        ex("Тяга резинки к поясу", 3, "12-15", 60),
        ex("Ягодичный мост", 3, "12-15", 45),
        ex("Птица-собака", 3, "8/стор", 40),
        ex("Боковая планка", 3, "20-40с", 40),
        ex("Мёртвый жук", 3, "8/стор", 40),
    ]


def home_bands_a():
    return [
        ex("Приседания со своим весом", 3, "12-15", 60),
        ex("Тяга резинки к поясу", 3, "12-15", 60),
        ex("Отжимания от пола", 3, "8-12", 60),
        ex("Выпады вперёд", 3, "8-12/стор", 60),
        ex("Планка", 3, "30-45с", 45),
        ex("Ягодичный мост", 3, "12-15", 45),
    ]


def home_bands_b():
    return [
        ex("Боковые выпады", 3, "8-12/стор", 60),
        ex("Тяга резинки к поясу", 3, "12-15", 60),
        ex("Отжимания с возвышения", 3, "8-15", 60),
        ex("Ягодичный мост", 3, "15-20", 45),
        ex("Боковая планка", 3, "20-40с", 45),
        ex("Мёртвый жук", 3, "8/стор", 45),
    ]


def home_bands_c():
    return [
        ex("Приседания со своим весом", 3, "15-20", 55),
        ex("Отжимания узким хватом", 3, "6-12", 60),
        ex("Тяга резинки к поясу", 3, "12-15", 55),
        ex("Обратные выпады с поворотом", 3, "8/стор", 55),
        ex("Планка с касанием плеч", 3, "8/стор", 45),
        ex("Скручивания", 3, "12-15", 40),
    ]


def home_db_male_a(sets=3, reps="8-12", rest=75):
    return [
        ex("Приседания с гантелью у груди", sets, reps, rest),
        ex("Жим гантелей лёжа", sets, reps, rest),
        ex("Тяга гантели в наклоне", sets, reps, rest),
        ex("Жим гантелей сидя", sets, reps, rest - 5 if rest > 60 else rest),
        ex("Румынская тяга с гантелями", sets, reps, rest),
        ex("Планка", sets, "30-45с", 45),
    ]


def home_db_male_b(sets=3, reps="8-12", rest=75):
    return [
        ex("Выпады назад с гантелями", sets, "8-12/стор", rest - 5 if rest > 60 else rest),
        ex("Жим гантелей на наклонной", sets, reps, rest),
        ex("Тяга гантели в наклоне", sets, reps, rest),
        ex("Разводка гантелей в стороны", sets, "10-15", 55),
        ex("Молотковые сгибания", sets, reps, 55),
        ex("Французский жим гантели", sets, reps, 55),
    ]


def home_db_male_c(sets=3, reps="8-12", rest=75):
    return [
        ex("Болгарские выпады", sets, "8-12/стор", rest),
        ex("Присед + жим гантелей", sets, reps, rest),
        ex("Пуловер с гантелью", sets, reps, 60),
        ex("Ягодичный мост", sets, "12-15", 45),
        ex("Сгибания гантелей на бицепс", sets, reps, 55),
        ex("Боковая планка", sets, "20-40с", 45),
    ]


def ppl_push_beg():
    return [
        ex("Жим гантелей лёжа", 3, "8-12", 75),
        ex("Жим гантелей сидя", 3, "8-12", 75),
        ex("Разведение гантелей лёжа", 3, "10-15", 60),
        ex("Разводка гантелей в стороны", 3, "10-15", 55),
        ex("Разгибания на блоке", 3, "10-15", 55),
    ]


def ppl_pull_beg():
    return [
        ex("Тяга верхнего блока", 3, "8-12", 75),
        ex("Тяга горизонтального блока", 3, "8-12", 75),
        ex("Тяга к лицу", 3, "12-15", 55),
        ex("Сгибания гантелей на бицепс", 3, "8-12", 55),
        ex("Планка", 3, "30-45с", 45),
    ]


def ppl_legs_beg():
    return [
        ex("Жим ногами", 3, "10-15", 75),
        ex("Румынская тяга с гантелями", 3, "8-12", 75),
        ex("Выпады вперёд", 3, "8-12/стор", 70),
        ex("Сгибания ног лёжа", 3, "10-15", 55),
        ex("Подъёмы на носки стоя", 3, "12-15", 40),
    ]


def build_all() -> list[dict]:
    programs: list[dict] = []

    # ===== BEGINNER MALE =====
    programs.append(prog(
        name="М · Зал · Новичок · Тренажёры FB",
        description="Мужская full body на тренажёрах и гантелях. 3 дня. Без разминочных упражнений в списке — разминку делайте 5–8 мин сами.",
        level="beginner", workout_type="full_body",
        sex=["male"], location="gym",
        equipment=["machines", "dumbbells"], limitations=[],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "Full Body A", "full", gym_male_beg_a()),
            day(2, "Full Body B", "full", gym_male_beg_b()),
            day(3, "Full Body C", "full", gym_male_beg_c()),
        ],
    ))
    programs.append(prog(
        name="М · Зал · Новичок · PPL intro",
        description="Мягкий push/pull/legs для мужчины-новичка в зале.",
        level="beginner", workout_type="push_pull_legs",
        sex=["male"], location="gym",
        equipment=["machines", "dumbbells", "barbell"], limitations=[],
        days_per_week=3, session_min=50,
        schedule=[
            day(1, "Push", "push", ppl_push_beg()),
            day(2, "Pull", "pull", ppl_pull_beg()),
            day(3, "Legs", "legs", ppl_legs_beg()),
        ],
    ))
    programs.append(prog(
        name="М · Зал · Новичок · Гантели FB",
        description="Full body преимущественно с гантелями (зал/уголок).",
        level="beginner", workout_type="full_body",
        sex=["male"], location="gym",
        equipment=["dumbbells"], limitations=[],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "DB A", "full", home_db_male_a()),
            day(2, "DB B", "full", home_db_male_b()),
            day(3, "DB C", "full", home_db_male_c()),
        ],
    ))
    programs.append(prog(
        name="М · Дом · Новичок · Свой вес",
        description="Домашняя программа с весом тела, 3 дня.",
        level="beginner", workout_type="home_express",
        sex=["male"], location="home",
        equipment=["bodyweight"], limitations=[],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "Home A", "full", fb_bw_a()),
            day(2, "Home B", "full", fb_bw_b()),
            day(3, "Home C", "full", fb_bw_c()),
        ],
    ))
    programs.append(prog(
        name="М · Улица · Новичок · Площадка",
        description="Уличная программа: турник/брусья/свой вес. Разминку на улице — отдельно.",
        level="beginner", workout_type="conditioning",
        sex=["male"], location="outdoor",
        equipment=["bodyweight"], limitations=[],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Outdoor A", "full", outdoor_a()),
            day(2, "Outdoor B", "full", outdoor_b()),
            day(3, "Outdoor C + резинка", "full", outdoor_c_bands()),
        ],
    ))

    # ===== BEGINNER FEMALE =====
    programs.append(prog(
        name="Ж · Зал · Новичок · Ягодицы + верх",
        description="Женская full body с акцентом на ноги/ягодицы и верх. Зал.",
        level="beginner", workout_type="hypertrophy",
        sex=["female"], location="gym",
        equipment=["machines", "dumbbells", "barbell"], limitations=[],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "Lower + pull", "full", gym_female_beg_a()),
            day(2, "Glute + push", "full", gym_female_beg_b()),
            day(3, "Legs + upper", "full", gym_female_beg_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Зал · Новичок · Тренажёры FB",
        description="Мягкий вход в зал на тренажёрах, 3 full body.",
        level="beginner", workout_type="full_body",
        sex=["female"], location="gym",
        equipment=["machines", "dumbbells"], limitations=[],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Machine A", "full", [
                ex("Жим ногами", 3, "12-15", 70),
                ex("Жим в тренажёре", 3, "10-15", 70),
                ex("Тяга верхнего блока", 3, "10-15", 70),
                ex("Ягодичный мост", 3, "12-15", 55),
                ex("Разводка гантелей в стороны", 3, "12-15", 55),
                ex("Планка", 3, "20-40с", 40),
            ]),
            day(2, "Machine B", "full", [
                ex("Сгибания ног лёжа", 3, "12-15", 60),
                ex("Тяга горизонтального блока", 3, "10-15", 70),
                ex("Жим гантелей сидя", 3, "10-15", 65),
                ex("Разгибания ног", 3, "12-15", 55),
                ex("Сгибания гантелей на бицепс", 3, "10-15", 55),
                ex("Скручивания", 3, "12-15", 40),
            ]),
            day(3, "Machine C", "full", gym_female_beg_b()),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Новичок · Свой вес",
        description="Дома: свой вес, акцент на бёдра/ягодицы и кор.",
        level="beginner", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["bodyweight"], limitations=[],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "Home A", "full", home_female_a_bw()),
            day(2, "Home B", "full", home_female_b_bw_fixed()),
            day(3, "Home C", "full", home_female_c_bw()),
        ],
    ))
    programs.append(prog(
        name="Ж · Улица · Новичок · Площадка",
        description="Улица/парк: свой вес, без разминочного блока в списке.",
        level="beginner", workout_type="conditioning",
        sex=["female"], location="outdoor",
        equipment=["bodyweight"], limitations=[],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "Outdoor A", "full", [
                ex("Приседания со своим весом", 3, "12-15", 55),
                ex("Ягодичный мост", 3, "15-20", 45),
                ex("Отжимания с возвышения", 3, "8-12", 55),
                ex("Выпады вперёд", 3, "8-12/стор", 55),
                ex("Планка", 3, "20-40с", 40),
                ex("Высокие колени", 2, "20-30с", 40),
            ]),
            day(2, "Outdoor B", "full", outdoor_b()),
            day(3, "Outdoor C", "full", [
                ex("Боковые выпады", 3, "8-12/стор", 55),
                ex("Отжимания с колен", 3, "8-15", 55),
                ex("Австралийские подтягивания", 3, "5-10", 70),
                ex("Ягодичный мост", 3, "15-20", 45),
                ex("Боковая планка", 3, "15-30с", 40),
                ex("Скручивания", 3, "12-15", 40),
            ]),
        ],
    ))

    # ===== INTERMEDIATE MALE =====
    programs.append(prog(
        name="М · Зал · Опытный · Верх/Низ 4 дня",
        description="Upper/Lower 4 дня: штанга, гантели, блоки.",
        level="intermediate", workout_type="upper_lower",
        sex=["male"], location="gym",
        equipment=["barbell", "dumbbells", "machines"], limitations=[],
        days_per_week=4, session_min=55, duration_weeks=8,
        schedule=[
            day(1, "Upper A", "upper", gym_male_int_upper()),
            day(2, "Lower A", "lower", gym_male_int_lower()),
            day(3, "Upper B", "upper", gym_male_int_upper_b()),
            day(4, "Lower B", "lower", gym_male_int_lower_b()),
        ],
    ))
    programs.append(prog(
        name="М · Зал · Опытный · PPL 3 дня",
        description="Классический PPL 3 дня для опытного.",
        level="intermediate", workout_type="push_pull_legs",
        sex=["male"], location="gym",
        equipment=["barbell", "dumbbells", "machines"], limitations=[],
        days_per_week=3, session_min=55, duration_weeks=8,
        schedule=[
            day(1, "Push", "push", gym_adv_push(sets=3, reps="6-10", rest=100)[:5]),
            day(2, "Pull", "pull", [
                ex("Тяга штанги в наклоне", 4, "6-10", 100),
                ex("Подтягивания", 3, "5-10", 90),
                ex("Тяга верхнего блока", 3, "8-12", 75),
                ex("Тяга к лицу", 3, "12-15", 55),
                ex("Сгибания со штангой", 3, "6-10", 70),
            ]),
            day(3, "Legs", "legs", gym_male_int_lower()),
        ],
    ))
    programs.append(prog(
        name="М · Дом · Опытный · Гантели",
        description="Дом с гантелями, full body 3 дня.",
        level="intermediate", workout_type="home_express",
        sex=["male"], location="home",
        equipment=["dumbbells", "bodyweight"], limitations=[],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "Home DB A", "full", home_db_male_a( ) if False else home_db_male_a()),
            day(2, "Home DB B", "full", home_db_male_b()),
            day(3, "Home DB C", "full", home_db_male_c()),
        ],
    ))
    programs.append(prog(
        name="М · Улица · Опытный · Сила площадки",
        description="Улица: подтягивания, отжимания, ноги, кор. Без разминки в списке.",
        level="intermediate", workout_type="strength",
        sex=["male"], location="outdoor",
        equipment=["bodyweight"], limitations=[],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "Push + legs", "full", [
                ex("Отжимания на брусьях", 4, "6-12", 90),
                ex("Отжимания от пола", 3, "10-20", 60),
                ex("Приседания со своим весом", 4, "15-25", 60),
                ex("Выпады вперёд", 3, "10-15/стор", 60),
                ex("Планка", 3, "40-60с", 45),
            ]),
            day(2, "Pull + core", "full", [
                ex("Подтягивания", 4, "4-10", 100),
                ex("Австралийские подтягивания", 3, "8-15", 75),
                ex("Отжимания узким хватом", 3, "8-15", 60),
                ex("Удержание «лодочки»", 3, "20-40с", 45),
                ex("Альпинисты", 3, "20-30с", 45),
            ]),
            day(3, "Full circuit", "full", outdoor_a(sets=4)),
        ],
    ))

    # ===== INTERMEDIATE FEMALE =====
    programs.append(prog(
        name="Ж · Зал · Опытный · Glute focus 3 дня",
        description="Опытная: ягодицы/ноги + верх, 3 дня в зале.",
        level="intermediate", workout_type="hypertrophy",
        sex=["female"], location="gym",
        equipment=["barbell", "dumbbells", "machines"], limitations=[],
        days_per_week=3, session_min=50, duration_weeks=8,
        schedule=[
            day(1, "Glute A", "lower", gym_female_int_lower_glute()),
            day(2, "Upper", "upper", gym_female_int_upper()),
            day(3, "Full + glute", "full", gym_female_int_full()),
        ],
    ))
    programs.append(prog(
        name="Ж · Зал · Опытный · Верх/Низ 4 дня",
        description="4 дня upper/lower с акцентом на бёдра и ягодицы.",
        level="intermediate", workout_type="upper_lower",
        sex=["female"], location="gym",
        equipment=["barbell", "dumbbells", "machines"], limitations=[],
        days_per_week=4, session_min=50, duration_weeks=8,
        schedule=[
            day(1, "Upper A", "upper", gym_female_int_upper()),
            day(2, "Lower glute A", "lower", gym_female_int_lower_glute()),
            day(3, "Upper B", "upper", [
                ex("Жим гантелей на наклонной", 3, "8-12", 75),
                ex("Тяга горизонтального блока", 3, "8-12", 75),
                ex("Жим Арнольда", 3, "8-12", 70),
                ex("Тяга к лицу", 3, "12-15", 55),
                ex("Сгибания гантелей на бицепс", 3, "10-15", 55),
                ex("Разгибания на блоке", 3, "10-15", 55),
            ]),
            day(4, "Lower B", "lower", [
                ex("Приседания с гантелью у груди", 4, "8-12", 80),
                ex("Румынская тяга с гантелями", 4, "8-12", 80),
                ex("Выпады назад с гантелями", 3, "8-12/стор", 70),
                ex("Разгибания ног", 3, "10-15", 55),
                ex("Подъёмы на носки сидя", 3, "12-15", 40),
                ex("Планка", 3, "30-45с", 40),
            ]),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Опытный · Резинки + вес тела",
        description="Дом: резинки и свой вес, 3 дня.",
        level="intermediate", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["bands", "bodyweight"], limitations=[],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Bands A", "full", home_bands_a()),
            day(2, "Bands B", "full", home_bands_b()),
            day(3, "Bands C", "full", home_bands_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Улица · Опытный · Площадка",
        description="Улица для опытной: сила + ягодицы своим весом.",
        level="intermediate", workout_type="conditioning",
        sex=["female"], location="outdoor",
        equipment=["bodyweight"], limitations=[],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Legs + glute", "lower", [
                ex("Приседания со своим весом", 4, "15-25", 55),
                ex("Ягодичный мост", 4, "15-20", 45),
                ex("Выпады вперёд", 3, "10-15/стор", 55),
                ex("Боковые выпады", 3, "8-12/стор", 55),
                ex("Планка", 3, "30-45с", 40),
            ]),
            day(2, "Upper + core", "upper", [
                ex("Отжимания от пола", 4, "6-15", 60),
                ex("Австралийские подтягивания", 3, "6-12", 70),
                ex("Отжимания с возвышения", 3, "8-15", 55),
                ex("Боковая планка", 3, "20-40с", 40),
                ex("Скручивания", 3, "12-15", 40),
            ]),
            day(3, "Full", "full", outdoor_b(sets=4)),
        ],
    ))

    # ===== ADVANCED =====
    programs.append(prog(
        name="М · Зал · Продвинутый · PPL 6 дней",
        description="PPL x2 для продвинутых. Высокий объём, зал.",
        level="advanced", workout_type="push_pull_legs",
        sex=["male"], location="gym",
        equipment=["barbell", "dumbbells", "machines"], limitations=[],
        days_per_week=6, session_min=60, duration_weeks=8,
        schedule=[
            day(1, "Push A", "push", gym_adv_push()),
            day(2, "Pull A", "pull", gym_adv_pull()),
            day(3, "Legs A", "legs", gym_adv_legs()),
            day(4, "Push B", "push", gym_adv_push_b()),
            day(5, "Pull B", "pull", gym_adv_pull_b()),
            day(6, "Legs B", "legs", gym_adv_legs_b()),
        ],
    ))
    programs.append(prog(
        name="Ж · Зал · Продвинутый · Гипертрофия 4 дня",
        description="Продвинутая женская гипертрофия upper/lower.",
        level="advanced", workout_type="hypertrophy",
        sex=["female"], location="gym",
        equipment=["barbell", "dumbbells", "machines"], limitations=[],
        days_per_week=4, session_min=55, duration_weeks=8,
        schedule=[
            day(1, "Lower strength", "lower", [
                ex("Приседания со штангой", 4, "5-8", 120),
                ex("Ягодичный мост со штангой", 4, "6-10", 90),
                ex("Румынская тяга", 3, "6-10", 100),
                ex("Болгарские выпады", 3, "8-12/стор", 75),
                ex("Сгибания ног лёжа", 3, "8-12", 60),
            ]),
            day(2, "Upper strength", "upper", [
                ex("Жим гантелей лёжа", 4, "6-10", 90),
                ex("Тяга штанги в наклоне", 4, "6-10", 90),
                ex("Жим гантелей сидя", 3, "6-10", 80),
                ex("Тяга верхнего блока", 3, "6-10", 75),
                ex("Разгибания на блоке", 3, "8-12", 55),
            ]),
            day(3, "Lower volume", "lower", gym_female_int_lower_glute()),
            day(4, "Upper volume", "upper", gym_female_int_upper() + [ex("Тяга к лицу", 3, "12-15", 55)]),
        ],
    ))
    programs.append(prog(
        name="М · Дом · Продвинутый · Гантели dense",
        description="Плотный домашний комплекс с гантелями.",
        level="advanced", workout_type="strength",
        sex=["male"], location="home",
        equipment=["dumbbells", "bodyweight"], limitations=[],
        days_per_week=4, session_min=50,
        schedule=[
            day(1, "Push home", "push", [
                ex("Жим гантелей лёжа", 4, "5-8", 100),
                ex("Жим гантелей сидя", 4, "5-8", 90),
                ex("Отжимания на брусьях", 3, "6-12", 90),
                ex("Разводка гантелей в стороны", 3, "10-15", 55),
                ex("Французский жим гантели", 3, "6-10", 60),
            ]),
            day(2, "Pull home", "pull", [
                ex("Тяга гантели в наклоне", 4, "5-8", 90),
                ex("Подтягивания", 4, "4-10", 100),
                ex("Пуловер с гантелью", 3, "8-12", 60),
                ex("Молотковые сгибания", 3, "6-10", 55),
                ex("Планка", 3, "40-60с", 40),
            ]),
            day(3, "Legs home", "legs", [
                ex("Приседания с гантелью у груди", 4, "6-10", 90),
                ex("Румынская тяга с гантелями", 4, "6-10", 90),
                ex("Болгарские выпады", 3, "8-12/стор", 75),
                ex("Ягодичный мост", 3, "10-15", 45),
                ex("Подъёмы на носки стоя", 4, "8-12", 40),
            ]),
            day(4, "Full dense", "full", home_db_male_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Продвинутый · Резинки dense",
        description="Продвинутый дом: резинки + вес тела, 4 дня.",
        level="advanced", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["bands", "bodyweight"], limitations=[],
        days_per_week=4, session_min=45,
        schedule=[
            day(1, "Lower", "lower", [
                ex("Приседания со своим весом", 4, "15-25", 50),
                ex("Ягодичный мост", 4, "15-20", 40),
                ex("Выпады вперёд", 3, "12-15/стор", 50),
                ex("Боковые выпады", 3, "10-12/стор", 50),
                ex("Планка", 3, "40-60с", 40),
            ]),
            day(2, "Upper", "upper", [
                ex("Отжимания от пола", 4, "8-15", 55),
                ex("Тяга резинки к поясу", 4, "12-15", 50),
                ex("Отжимания узким хватом", 3, "6-12", 55),
                ex("Планка с касанием плеч", 3, "8-12/стор", 40),
                ex("Скручивания", 3, "15-20", 35),
            ]),
            day(3, "Lower B", "lower", home_bands_b()),
            day(4, "Full", "full", home_bands_c()),
        ],
    ))

    # ===== JOINT LIMITS =====
    programs.append(prog(
        name="М · Зал · Без нагрузки на колени",
        description="Мужская зальная программа без приседов/выпадов/прыжков. Акцент: верх + hinge/ягодицы + сгибатели бедра.",
        level="beginner", workout_type="full_body",
        sex=["male"], location="gym",
        equipment=["machines", "dumbbells", "barbell"], limitations=["no_knee"],
        days_per_week=3, session_min=50,
        schedule=[
            day(1, "No-knee A", "full", no_knee_male_a()),
            day(2, "No-knee B", "full", no_knee_male_b()),
            day(3, "No-knee C", "full", no_knee_male_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Зал · Без нагрузки на колени",
        description="Женская зальная без осевой нагрузки на колени (без приседов/выпадов).",
        level="beginner", workout_type="hypertrophy",
        sex=["female"], location="gym",
        equipment=["machines", "dumbbells", "barbell"], limitations=["no_knee"],
        days_per_week=3, session_min=50,
        schedule=[
            day(1, "No-knee A", "full", no_knee_female_a()),
            day(2, "No-knee B", "full", no_knee_female_b()),
            day(3, "No-knee C", "full", no_knee_female_c()),
        ],
    ))
    # Home + no_knee
    programs.append(prog(
        name="М · Дом · Без нагрузки на колени · Гантели",
        description=(
            "Дом, без приседов/выпадов/прыжков. Гантели + вес тела: жимы, тяги, "
            "ягодичный мост, румынская тяга, кор."
        ),
        level="beginner", workout_type="home_express",
        sex=["male"], location="home",
        equipment=["dumbbells", "bodyweight"], limitations=["no_knee"],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "No-knee home A", "full", home_no_knee_male_a()),
            day(2, "No-knee home B", "full", home_no_knee_male_b()),
            day(3, "No-knee home C", "full", home_no_knee_male_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Без нагрузки на колени · Гантели",
        description=(
            "Дом для женщин без нагрузки на колени: мост, hinge, верх с гантелями, кор. "
            "Без приседов, выпадов и прыжков."
        ),
        level="beginner", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["dumbbells", "bodyweight"], limitations=["no_knee"],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "No-knee home A", "full", home_no_knee_female_a()),
            day(2, "No-knee home B", "full", home_no_knee_female_b()),
            day(3, "No-knee home C", "full", home_no_knee_female_c()),
        ],
    ))
    programs.append(prog(
        name="М · Дом · Без нагрузки на колени · Свой вес",
        description="Дом без гантелей и без нагрузки на колени: отжимания, австралийские подтягивания, мост, кор.",
        level="beginner", workout_type="home_express",
        sex=["male"], location="home",
        equipment=["bodyweight", "bands"], limitations=["no_knee"],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "No-knee BW A", "full", home_no_knee_bw_a()),
            day(2, "No-knee BW B", "full", home_no_knee_bw_b()),
            day(3, "No-knee BW C", "full", home_no_knee_bw_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Без нагрузки на колени · Свой вес",
        description="Дом, свой вес/резинка, без приседов и выпадов. Акцент: ягодичный мост и кор + верх.",
        level="beginner", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["bodyweight", "bands"], limitations=["no_knee"],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "No-knee BW A", "full", home_no_knee_bw_a()),
            day(2, "No-knee BW B", "full", home_no_knee_bw_b()),
            day(3, "No-knee BW C", "full", home_no_knee_bw_c()),
        ],
    ))
    # Home + dumbbells for women (men already have intermediate/advanced DB home)
    programs.append(prog(
        name="Ж · Дом · Новичок · Гантели",
        description="Дом с гантелями для женщин: ноги/ягодицы + верх, 3 full body.",
        level="beginner", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["dumbbells", "bodyweight"], limitations=[],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Home DB A", "full", home_db_female_a()),
            day(2, "Home DB B", "full", home_db_female_b()),
            day(3, "Home DB C", "full", home_db_female_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Опытный · Гантели",
        description="Дом с гантелями, чуть выше объём/сложность (болгарские, RDL, жимы).",
        level="intermediate", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["dumbbells", "bodyweight"], limitations=[],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "Home DB A", "full", home_db_female_a(sets=4, reps="8-12", rest=70)),
            day(2, "Home DB B", "full", home_db_female_b(sets=4, reps="8-12", rest=70)),
            day(3, "Home DB C", "full", home_db_female_c(sets=4, reps="8-12", rest=70)),
        ],
    ))
    programs.append(prog(
        name="М · Дом · Новичок · Гантели",
        description="Дом с гантелями для мужчин-новичков, 3 full body (мягче, чем «Опытный · Гантели»).",
        level="beginner", workout_type="home_express",
        sex=["male"], location="home",
        equipment=["dumbbells", "bodyweight"], limitations=[],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Home DB A", "full", home_db_male_a(3, "8-12", 70)),
            day(2, "Home DB B", "full", home_db_male_b(3, "8-12", 70)),
            day(3, "Home DB C", "full", home_db_male_c(3, "8-12", 70)),
        ],
    ))
    programs.append(prog(
        name="М · Зал · Новичок · Без нагрузки на позвоночник",
        description="Новичок мужчина: машины и жимы, минимум осевой нагрузки на позвоночник (без становой/тяг в наклоне).",
        level="beginner", workout_type="full_body",
        sex=["male"], location="gym",
        equipment=["machines", "dumbbells"], limitations=["no_spine"],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "Spine-safe A", "full", no_spine_beg_male_a()),
            day(2, "Spine-safe B", "full", no_spine_beg_male_b()),
            day(3, "Spine-safe C", "full", no_spine_beg_male_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Зал · Новичок · Без нагрузки на позвоночник",
        description="Новичок женщина: тренажёры и гантели, без становой и наклонных тяг.",
        level="beginner", workout_type="full_body",
        sex=["female"], location="gym",
        equipment=["machines", "dumbbells"], limitations=["no_spine"],
        days_per_week=3, session_min=45,
        schedule=[
            day(1, "Spine-safe A", "full", no_spine_beg_female_a()),
            day(2, "Spine-safe B", "full", no_spine_beg_female_b()),
            day(3, "Spine-safe C", "full", no_spine_beg_female_c()),
        ],
    ))
    programs.append(prog(
        name="М · Зал · Опытный · Без нагрузки на позвоночник",
        description="Опытный мужчина: сила верха + ноги в тренажёрах, без осевой нагрузки на позвоночник.",
        level="intermediate", workout_type="upper_lower",
        sex=["male"], location="gym",
        equipment=["machines", "dumbbells", "barbell"], limitations=["no_spine"],
        days_per_week=3, session_min=50,
        schedule=[
            day(1, "Spine-safe A", "full", no_spine_int_male_a()),
            day(2, "Spine-safe B", "full", no_spine_int_male_b()),
            day(3, "Spine-safe C", "full", no_spine_int_male_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Зал · Опытный · Без нагрузки на позвоночник",
        description="Опытная: ягодицы/ноги в тренажёрах + верх, без становой и наклонных тяг.",
        level="intermediate", workout_type="hypertrophy",
        sex=["female"], location="gym",
        equipment=["machines", "dumbbells"], limitations=["no_spine"],
        days_per_week=3, session_min=50,
        schedule=[
            day(1, "Spine-safe A", "full", no_spine_int_female_a()),
            day(2, "Spine-safe B", "full", no_spine_int_female_b()),
            day(3, "Spine-safe C", "full", no_spine_int_female_c()),
        ],
    ))

    # Home + no_spine
    programs.append(prog(
        name="М · Дом · Без нагрузки на позвоночник · Гантели",
        description="Дом без становой и тяг в наклоне: жимы, резинка/горизонтальные тяги, мост, кор.",
        level="beginner", workout_type="home_express",
        sex=["male"], location="home",
        equipment=["dumbbells", "bands", "bodyweight"], limitations=["no_spine"],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Spine-safe home A", "full", home_no_spine_a()),
            day(2, "Spine-safe home B", "full", home_no_spine_b()),
            day(3, "Spine-safe home C", "full", home_no_spine_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Без нагрузки на позвоночник · Гантели",
        description="Дом для женщин без осевой нагрузки на позвоночник: мост, жимы, резинка, кор.",
        level="beginner", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["dumbbells", "bands", "bodyweight"], limitations=["no_spine"],
        days_per_week=3, session_min=40,
        schedule=[
            day(1, "Spine-safe home A", "full", home_no_spine_a()),
            day(2, "Spine-safe home B", "full", home_no_spine_b()),
            day(3, "Spine-safe home C", "full", home_no_spine_c()),
        ],
    ))

    # Outdoor + no_knee
    programs.append(prog(
        name="М · Улица · Без нагрузки на колени",
        description="Площадка без приседов, выпадов и прыжков: отжимания, австралийские, мост, кор.",
        level="beginner", workout_type="conditioning",
        sex=["male"], location="outdoor",
        equipment=["bodyweight", "bands"], limitations=["no_knee"],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "Outdoor no-knee A", "full", outdoor_no_knee_a()),
            day(2, "Outdoor no-knee B", "full", outdoor_no_knee_b()),
            day(3, "Outdoor no-knee C", "full", outdoor_no_knee_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Улица · Без нагрузки на колени",
        description="Улица без нагрузки на колени: верх + мост + кор, без прыжков и выпадов.",
        level="beginner", workout_type="conditioning",
        sex=["female"], location="outdoor",
        equipment=["bodyweight", "bands"], limitations=["no_knee"],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "Outdoor no-knee A", "full", outdoor_no_knee_a()),
            day(2, "Outdoor no-knee B", "full", outdoor_no_knee_b()),
            day(3, "Outdoor no-knee C", "full", outdoor_no_knee_c()),
        ],
    ))

    # Home bands male beginner extra
    programs.append(prog(
        name="М · Дом · Новичок · Резинки",
        description="Дом с резинками для новичка-мужчины.",
        level="beginner", workout_type="home_express",
        sex=["male"], location="home",
        equipment=["bands", "bodyweight"], limitations=[],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "Bands A", "full", home_bands_a()),
            day(2, "Bands B", "full", home_bands_b()),
            day(3, "Bands C", "full", home_bands_c()),
        ],
    ))
    programs.append(prog(
        name="Ж · Дом · Новичок · Резинки",
        description="Дом с резинками для новичка-женщины.",
        level="beginner", workout_type="home_express",
        sex=["female"], location="home",
        equipment=["bands", "bodyweight"], limitations=[],
        days_per_week=3, session_min=35,
        schedule=[
            day(1, "Bands A", "full", home_bands_a()),
            day(2, "Bands B", "full", [
                ex("Приседания со своим весом", 3, "15-20", 50),
                ex("Тяга резинки к поясу", 3, "12-15", 55),
                ex("Ягодичный мост", 3, "15-20", 40),
                ex("Отжимания с возвышения", 3, "8-12", 55),
                ex("Боковые выпады", 3, "8-12/стор", 55),
                ex("Скручивания", 3, "12-15", 40),
            ]),
            day(3, "Bands C", "full", home_bands_c()),
        ],
    ))

    return programs


def validate(programs: list[dict]) -> None:
    names = json.loads((Path(__file__).resolve().parent / "seed_content" / "exercises.json").read_text(encoding="utf-8"))
    known = {e["name_ru"] for e in names}
    missing: set[str] = set()
    for p in programs:
        for d in p["structure"]["schedule"]:
            for item in d["exercises"]:
                n = item["exercise_name"]
                if n not in known:
                    missing.add(n)
    if missing:
        raise SystemExit("Unknown exercises:\n- " + "\n- ".join(sorted(missing)))


def main() -> None:
    programs = build_all()
    validate(programs)
    OUT.write_text(json.dumps(programs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(programs)} programs -> {OUT}")
    # summary
    from collections import Counter
    c = Counter()
    for p in programs:
        st = p["structure"]
        key = f"{st['sex'][0]}|{st['location']}|{st['level']}|lim={','.join(st['limitations']) or '-'}"
        c[key] += 1
    for k, v in sorted(c.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
