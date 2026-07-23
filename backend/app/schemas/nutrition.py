"""Nutrition request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date as Date
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

MealType = Literal["breakfast", "lunch", "dinner", "snack"]


class NutritionProductResponse(BaseModel):
    id: uuid.UUID
    name_ru: str
    barcode: Optional[str] = None
    calories: float
    proteins: float
    fats: float
    carbs: float
    category: Optional[str] = None
    source: str

    model_config = {"from_attributes": True}


class NutritionProductListResponse(BaseModel):
    items: list[NutritionProductResponse]
    total: int


class NutritionLogCreate(BaseModel):
    product_id: uuid.UUID
    quantity_grams: Decimal = Field(..., gt=0)
    meal_type: MealType
    # Avoid field name clashing with datetime.date under Python 3.14 + pydantic
    log_date: Optional[Date] = Field(default=None, alias="date")

    model_config = {"populate_by_name": True}


class NutritionLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    date: Date
    meal_type: str
    product_id: uuid.UUID
    quantity_grams: float
    calculated_kbj: dict[str, Any]
    product: Optional[NutritionProductResponse] = None

    model_config = {"from_attributes": True}


class EnergyTargetsResponse(BaseModel):
    complete: bool
    reason: str | None = None
    formula: str | None = None
    sex: str | None = None
    age: int | None = None
    birth_date: str | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    activity_level: str | None = None
    activity_factor: float | None = None
    bmr: float | None = None
    tdee: float | None = None
    calorie_adjustment_pct: float | None = None
    calories_target: float | None = None
    macros: dict[str, float] | None = None
    primary_goal: str | None = None


class DailyNutritionResponse(BaseModel):
    date: Date
    totals: dict[str, float]
    meals: dict[str, list[NutritionLogResponse]]
    targets: EnergyTargetsResponse | None = None
