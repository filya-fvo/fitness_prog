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




class NutritionProductCreate(BaseModel):
    """User-created product shared in global catalog."""

    name_ru: str = Field(..., min_length=1, max_length=200)
    calories: float = Field(..., ge=0, le=1200)
    proteins: float = Field(..., ge=0, le=100)
    fats: float = Field(..., ge=0, le=100)
    carbs: float = Field(..., ge=0, le=100)
    category: Optional[str] = Field(default="custom", max_length=80)
    barcode: Optional[str] = None


class NutritionProductListResponse(BaseModel):
    items: list[NutritionProductResponse]
    total: int


class BarcodeLookupResponse(BaseModel):
    found: bool
    barcode: str
    source: str | None = None
    product: NutritionProductResponse | None = None
    serving_grams: float | None = None
    created: bool = False
    error: str | None = None


class NutritionLogCreate(BaseModel):
    product_id: uuid.UUID
    quantity_grams: Decimal = Field(..., gt=0)
    meal_type: MealType
    # Avoid field name clashing with datetime.date under Python 3.14 + pydantic
    log_date: Optional[Date] = Field(default=None, alias="date")
    # Optional per-log override of KBJU per 100g (package label differs from catalog)
    calories_per_100: Optional[float] = Field(default=None, ge=0, le=1200)
    proteins_per_100: Optional[float] = Field(default=None, ge=0, le=100)
    fats_per_100: Optional[float] = Field(default=None, ge=0, le=100)
    carbs_per_100: Optional[float] = Field(default=None, ge=0, le=100)

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


class NutritionDayTotal(BaseModel):
    date: Date
    calories: float
    proteins: float = 0
    fats: float = 0
    carbs: float = 0
    has_logs: bool = False
    target_calories: float | None = None
    delta_calories: float | None = None  # eaten - target (positive = surplus)


class NutritionRangeResponse(BaseModel):
    start: Date
    end: Date
    days: list[NutritionDayTotal]
    targets: EnergyTargetsResponse | None = None
    daily_target_calories: float | None = None
    period_target_calories: float | None = None
    period_eaten_calories: float = 0
    period_delta_calories: float | None = None
