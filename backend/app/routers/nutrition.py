"""Nutrition routes — API contract."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.nutrition import (
    DailyNutritionResponse,
    EnergyTargetsResponse,
    NutritionLogCreate,
    NutritionLogResponse,
    NutritionProductListResponse,
    NutritionProductResponse,
)
from app.services import nutrition_service
from app.services.energy_targets import compute_energy_targets

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


def _product_resp(p) -> NutritionProductResponse:
    return NutritionProductResponse(
        id=p.id,
        name_ru=p.name_ru,
        barcode=p.barcode,
        calories=float(p.calories or 0),
        proteins=float(p.proteins or 0),
        fats=float(p.fats or 0),
        carbs=float(p.carbs or 0),
        category=p.category,
        source=p.source,
    )


@router.get("/products", response_model=NutritionProductListResponse)
async def search_products(
    q: str = Query(default="", description="Search by name/barcode"),
    limit: int = Query(default=20, ge=1, le=50),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NutritionProductListResponse:
    _ = user
    items, total = await nutrition_service.search_products(session, q=q, limit=limit)
    return NutritionProductListResponse(
        items=[_product_resp(p) for p in items],
        total=total,
    )


@router.post("/log", response_model=NutritionLogResponse, status_code=201)
async def add_log(
    body: NutritionLogCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NutritionLogResponse:
    row = await nutrition_service.add_log(session, user, body)
    products = await nutrition_service.get_products_map(session, [row.product_id])
    product = products.get(row.product_id)
    return NutritionLogResponse(
        id=row.id,
        user_id=row.user_id,
        date=row.date,
        meal_type=row.meal_type,
        product_id=row.product_id,
        quantity_grams=float(row.quantity_grams),
        calculated_kbj=row.calculated_kbj or {},
        product=_product_resp(product) if product else None,
    )


@router.get("/daily", response_model=DailyNutritionResponse)
async def daily(
    date_value: date | None = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyNutritionResponse:
    day = date_value or date.today()
    logs, totals = await nutrition_service.daily_summary(session, user, day)
    products = await nutrition_service.get_products_map(
        session, [log.product_id for log in logs]
    )
    meals: dict[str, list[NutritionLogResponse]] = {
        "breakfast": [],
        "lunch": [],
        "dinner": [],
        "snack": [],
    }
    for log in logs:
        product = products.get(log.product_id)
        item = NutritionLogResponse(
            id=log.id,
            user_id=log.user_id,
            date=log.date,
            meal_type=log.meal_type,
            product_id=log.product_id,
            quantity_grams=float(log.quantity_grams),
            calculated_kbj=log.calculated_kbj or {},
            product=_product_resp(product) if product else None,
        )
        meals.setdefault(log.meal_type, []).append(item)
    targets_raw = compute_energy_targets(user.anthropometry or {}, user.goals or {})
    targets = EnergyTargetsResponse.model_validate(targets_raw)
    return DailyNutritionResponse(date=day, totals=totals, meals=meals, targets=targets)


@router.get("/targets", response_model=EnergyTargetsResponse)
async def energy_targets(
    user: User = Depends(get_current_user),
) -> EnergyTargetsResponse:
    """BMR/TDEE/target calories from profile anthropometry + deficit/surplus %."""
    return EnergyTargetsResponse.model_validate(
        compute_energy_targets(user.anthropometry or {}, user.goals or {})
    )
