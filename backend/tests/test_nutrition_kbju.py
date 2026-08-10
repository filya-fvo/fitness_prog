from decimal import Decimal

from app.schemas.nutrition import NutritionLogUpdate
from app.services.nutrition_service import calc_kbju


def test_calc_kbju_per_portion():
    result = calc_kbju(
        calories_per_100=100,
        proteins_per_100=10,
        fats_per_100=5,
        carbs_per_100=20,
        quantity_grams=Decimal("150"),
    )
    assert result["calories"] == 150.0
    assert result["proteins"] == 15.0
    assert result["fats"] == 7.5
    assert result["carbs"] == 30.0


def test_nutrition_log_update_schema_partial():
    body = NutritionLogUpdate(quantity_grams=Decimal("80"))
    assert body.quantity_grams == Decimal("80")
    assert body.meal_type is None
    body2 = NutritionLogUpdate(meal_type="lunch")
    assert body2.meal_type == "lunch"
