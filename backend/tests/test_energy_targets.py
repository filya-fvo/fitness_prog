"""Unit tests for BMR/TDEE and calorie adjustment."""

from datetime import date

from app.services.energy_targets import (
    age_from_birth_date,
    compute_energy_targets,
    mifflin_st_jeor_bmr,
    resolve_adjustment_pct,
)


def test_mifflin_male_known_values() -> None:
    # 80kg, 180cm, 30y male = 10*80 + 6.25*180 - 5*30 + 5 = 1780
    bmr = mifflin_st_jeor_bmr(sex="male", weight_kg=80, height_cm=180, age=30)
    assert bmr == 1780.0


def test_mifflin_female_known_values() -> None:
    # 65kg, 165cm, 28y female = 10*65 + 6.25*165 - 5*28 - 161 = 1380.25
    bmr = mifflin_st_jeor_bmr(sex="female", weight_kg=65, height_cm=165, age=28)
    assert abs(bmr - 1380.25) < 1e-9


def test_russian_female_sex_uses_female_bmr_and_floor() -> None:
    result = compute_energy_targets(
        {
            "sex": "женский",
            "weight_kg": 45,
            "height_cm": 155,
            "age": 50,
        },
        {
            "primary_goal": "lose_fat",
            "activity_level": "sedentary",
            "calorie_adjustment_pct": -30,
        },
    )
    assert result["complete"] is True
    # same BMR as english female
    bmr_en = mifflin_st_jeor_bmr(sex="female", weight_kg=45, height_cm=155, age=50)
    assert result["bmr"] == round(bmr_en)
    # floor 1200 for women (not 1500)
    assert result["calories_target"] == 1200.0


def test_age_from_birth_date() -> None:
    age = age_from_birth_date("1996-07-22", today=date(2026, 7, 22))
    assert age == 30


def test_default_deficit_for_lose_fat() -> None:
    assert resolve_adjustment_pct({"primary_goal": "lose_fat"}) == -15.0
    assert resolve_adjustment_pct({"calorie_adjustment_pct": -20}) == -20.0


def test_compute_targets_complete() -> None:
    result = compute_energy_targets(
        {
            "sex": "male",
            "weight_kg": 80,
            "height_cm": 180,
            "birth_date": "1996-01-01",
        },
        {
            "primary_goal": "lose_fat",
            "activity_level": "moderate",
            "calorie_adjustment_pct": -15,
            "days_per_week": 4,
        },
        today=date(2026, 7, 22),
    )
    assert result["complete"] is True
    assert result["bmr"] and result["bmr"] > 1500
    assert result["tdee"] and result["tdee"] > result["bmr"]
    assert result["calories_target"] and result["calories_target"] < result["tdee"]
    assert result["macros"]["proteins_g"] > 0


def test_compute_targets_incomplete_without_age() -> None:
    result = compute_energy_targets(
        {"weight_kg": 70, "height_cm": 170, "sex": "female"},
        {"primary_goal": "maintain"},
    )
    assert result["complete"] is False
    assert result["reason"] == "need_age_or_birth_date"
