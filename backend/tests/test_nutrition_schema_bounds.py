"""Nutrition quantities must fail validation before reaching NUMERIC columns."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.nutrition import NutritionLogCreate, NutritionLogUpdate


def test_log_quantity_has_upper_bound() -> None:
    with pytest.raises(ValidationError):
        NutritionLogCreate(
            product_id=uuid4(),
            quantity_grams="100000.01",
            meal_type="lunch",
        )

    with pytest.raises(ValidationError):
        NutritionLogUpdate(quantity_grams="100000.01")
