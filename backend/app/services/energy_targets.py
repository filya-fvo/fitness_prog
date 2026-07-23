"""Daily energy targets from anthropometry + goals (Mifflin–St Jeor)."""

from __future__ import annotations

from datetime import date
from typing import Any


ACTIVITY_FACTORS: dict[str, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

# Default calorie adjustment % by primary goal if user did not set explicit %
GOAL_DEFAULT_PCT: dict[str, float] = {
    "lose_fat": -15.0,
    "gain_muscle": 10.0,
    "maintain": 0.0,
}


def age_from_birth_date(birth_date: str | date | None, today: date | None = None) -> int | None:
    if birth_date is None:
        return None
    if isinstance(birth_date, str):
        try:
            birth = date.fromisoformat(birth_date[:10])
        except ValueError:
            return None
    else:
        birth = birth_date
    ref = today or date.today()
    years = ref.year - birth.year - ((ref.month, ref.day) < (birth.month, birth.day))
    if years < 10 or years > 100:
        return None
    return years


def resolve_age(anthropometry: dict[str, Any], today: date | None = None) -> int | None:
    birth = anthropometry.get("birth_date")
    from_birth = age_from_birth_date(birth, today=today)
    if from_birth is not None:
        return from_birth
    raw = anthropometry.get("age")
    try:
        age = int(raw)
    except (TypeError, ValueError):
        return None
    if 10 <= age <= 100:
        return age
    return None


def mifflin_st_jeor_bmr(*, sex: str, weight_kg: float, height_cm: float, age: int) -> float:
    """BMR kcal/day. sex: male|female (default male if unknown)."""
    s = (sex or "male").lower()
    if s in {"f", "female", "woman", "ж", "жен", "женский"}:
        return 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age - 161.0
    return 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age + 5.0


def resolve_adjustment_pct(goals: dict[str, Any]) -> float:
    raw = goals.get("calorie_adjustment_pct")
    if raw is not None and raw != "":
        try:
            pct = float(raw)
            return max(-40.0, min(40.0, pct))
        except (TypeError, ValueError):
            pass
    goal = str(goals.get("primary_goal") or "maintain").lower()
    return GOAL_DEFAULT_PCT.get(goal, 0.0)


def resolve_activity_level(goals: dict[str, Any], anthropometry: dict[str, Any]) -> str:
    level = str(
        goals.get("activity_level")
        or anthropometry.get("activity_level")
        or "moderate"
    ).lower()
    if level not in ACTIVITY_FACTORS:
        # map training days roughly
        try:
            days = int(goals.get("days_per_week") or 3)
        except (TypeError, ValueError):
            days = 3
        if days <= 2:
            return "light"
        if days <= 4:
            return "moderate"
        if days <= 5:
            return "active"
        return "very_active"
    return level


def macro_split_grams(*, calories: float, weight_kg: float, primary_goal: str) -> dict[str, float]:
    """Simple macro targets (g). Protein ~1.6–2.0 g/kg, fat ~25–30% kcal, rest carbs."""
    goal = (primary_goal or "maintain").lower()
    protein_per_kg = 2.0 if goal == "lose_fat" else 1.8 if goal == "gain_muscle" else 1.6
    protein_g = max(80.0, protein_per_kg * weight_kg)
    fat_ratio = 0.25 if goal == "gain_muscle" else 0.30
    fat_g = max(40.0, (calories * fat_ratio) / 9.0)
    protein_kcal = protein_g * 4.0
    fat_kcal = fat_g * 9.0
    carbs_g = max(0.0, (calories - protein_kcal - fat_kcal) / 4.0)
    return {
        "proteins_g": round(protein_g, 1),
        "fats_g": round(fat_g, 1),
        "carbs_g": round(carbs_g, 1),
    }


def compute_energy_targets(
    anthropometry: dict[str, Any] | None,
    goals: dict[str, Any] | None,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Return BMR/TDEE/target calories + macros. incomplete=True if inputs missing."""
    anthro = anthropometry or {}
    g = goals or {}

    try:
        weight = float(anthro.get("weight_kg"))
        height = float(anthro.get("height_cm"))
    except (TypeError, ValueError):
        return {
            "complete": False,
            "reason": "need_weight_height",
            "calories_target": None,
            "bmr": None,
            "tdee": None,
        }

    age = resolve_age(anthro, today=today)
    if age is None:
        return {
            "complete": False,
            "reason": "need_age_or_birth_date",
            "calories_target": None,
            "bmr": None,
            "tdee": None,
            "weight_kg": weight,
            "height_cm": height,
        }

    sex = str(anthro.get("sex") or g.get("sex") or "male")
    activity = resolve_activity_level(g, anthro)
    factor = ACTIVITY_FACTORS[activity]
    bmr = mifflin_st_jeor_bmr(sex=sex, weight_kg=weight, height_cm=height, age=age)
    tdee = bmr * factor
    adj_pct = resolve_adjustment_pct(g)
    target = tdee * (1.0 + adj_pct / 100.0)
    # safety floor
    target = max(1200.0 if sex.lower().startswith("f") else 1500.0, target)
    primary = str(g.get("primary_goal") or "maintain")
    macros = macro_split_grams(calories=target, weight_kg=weight, primary_goal=primary)

    return {
        "complete": True,
        "reason": None,
        "formula": "mifflin_st_jeor",
        "sex": sex,
        "age": age,
        "birth_date": anthro.get("birth_date"),
        "weight_kg": round(weight, 2),
        "height_cm": round(height, 1),
        "activity_level": activity,
        "activity_factor": factor,
        "bmr": round(bmr, 0),
        "tdee": round(tdee, 0),
        "calorie_adjustment_pct": adj_pct,
        "calories_target": round(target, 0),
        "macros": macros,
        "primary_goal": primary,
    }
