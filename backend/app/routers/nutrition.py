"""Nutrition routes — API contract."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.nutrition import (
    BarcodeLookupResponse,
    DailyNutritionResponse,
    EnergyTargetsResponse,
    NutritionDayTotal,
    NutritionLogCreate,
    NutritionLogResponse,
    NutritionLogUpdate,
    NutritionLabelRecognitionResponse,
    NutritionProductCreate,
    NutritionProductListResponse,
    NutritionProductResponse,
    NutritionRangeResponse,
)
from app.services import nutrition_label_vision, nutrition_service
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
    category: str | None = Query(default=None, description="Filter by category"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=5000),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NutritionProductListResponse:
    _ = user
    items, total = await nutrition_service.search_products(
        session,
        q=q,
        category=category,
        limit=limit,
        offset=offset,
    )
    return NutritionProductListResponse(
        items=[_product_resp(p) for p in items],
        total=total,
    )




@router.post("/products", response_model=NutritionProductResponse, status_code=201)
async def create_product(
    body: NutritionProductCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NutritionProductResponse:
    """Add a custom product to the shared catalog (visible to all users)."""
    _ = user
    row = await nutrition_service.create_product(
        session,
        name_ru=body.name_ru,
        calories=body.calories,
        proteins=body.proteins,
        fats=body.fats,
        carbs=body.carbs,
        category=body.category,
        barcode=body.barcode,
    )
    return _product_resp(row)


@router.get("/barcode/{code}", response_model=BarcodeLookupResponse)
async def lookup_barcode(
    code: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BarcodeLookupResponse:
    """Resolve EAN/UPC barcode via local catalog, then Open Food Facts (cached)."""
    _ = user
    product, meta = await nutrition_service.lookup_barcode(session, code, fetch_remote=True)
    return BarcodeLookupResponse(
        found=bool(meta.get("found")),
        barcode=str(meta.get("barcode") or code),
        source=meta.get("source"),
        product=_product_resp(product) if product is not None else None,
        serving_grams=(
            float(meta["serving_grams"])
            if meta.get("serving_grams") is not None
            else None
        ),
        created=bool(meta.get("created")),
        error=meta.get("error"),
    )


@router.post("/label/recognize", response_model=NutritionLabelRecognitionResponse)
async def recognize_label(
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> NutritionLabelRecognitionResponse:
    """Extract an editable per-100g draft from a nutrition-label photo."""
    try:
        data, mime_type = await nutrition_label_vision.read_label_image(image)
    except nutrition_label_vision.NutritionLabelImageError as exc:
        detail = {
            "empty_image": "Файл изображения пуст",
            "image_too_large": "Фото слишком большое (максимум 8 МБ)",
            "unsupported_image": "Поддерживаются JPEG, PNG и WebP",
        }.get(str(exc), "Некорректное изображение")
        code = (
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            if str(exc) == "image_too_large"
            else status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
        )
        raise HTTPException(status_code=code, detail=detail) from exc

    try:
        result = await nutrition_label_vision.recognize_nutrition_label(
            data, mime_type, settings
        )
    except nutrition_label_vision.NutritionLabelInvalidResponse as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось разобрать ответ распознавания. Попробуйте другое фото",
        ) from exc
    except nutrition_label_vision.NutritionLabelUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Распознавание этикетки временно недоступно",
        ) from exc
    return result.model_copy(update={"remaining_requests": None})


@router.get("/categories")
async def list_categories(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    _ = user
    cats = await nutrition_service.list_categories(session)
    return {"items": cats, "total": len(cats)}


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


@router.put("/log/{log_id}", response_model=NutritionLogResponse)
async def update_log(
    log_id: uuid.UUID,
    body: NutritionLogUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NutritionLogResponse:
    row = await nutrition_service.update_log(session, user, log_id, body)
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


@router.delete("/log/{log_id}", status_code=204)
async def delete_log(
    log_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await nutrition_service.delete_log(session, user, log_id)


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


@router.get("/range", response_model=NutritionRangeResponse)
async def nutrition_range(
    days: int = Query(default=7, ge=1, le=31, description="Number of days ending at end date"),
    end: date | None = Query(default=None, description="Inclusive end date (default: today)"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NutritionRangeResponse:
    """Daily calorie totals for a period (for Progress day/week charts)."""
    end_day = end or date.today()
    start_day = end_day - timedelta(days=days - 1)
    raw_days = await nutrition_service.range_daily_totals(
        session, user, start=start_day, end=end_day
    )
    targets_raw = compute_energy_targets(user.anthropometry or {}, user.goals or {})
    targets = EnergyTargetsResponse.model_validate(targets_raw)
    daily_target = (
        float(targets.calories_target)
        if targets.complete and targets.calories_target is not None
        else None
    )
    day_models: list[NutritionDayTotal] = []
    eaten = 0.0
    for row in raw_days:
        cal = float(row["calories"])
        eaten += cal
        delta = (cal - daily_target) if daily_target is not None else None
        day_models.append(
            NutritionDayTotal(
                date=date.fromisoformat(str(row["date"])),
                calories=cal,
                proteins=float(row["proteins"]),
                fats=float(row["fats"]),
                carbs=float(row["carbs"]),
                has_logs=bool(row["has_logs"]),
                target_calories=daily_target,
                delta_calories=round(delta, 2) if delta is not None else None,
            )
        )
    period_target = (daily_target * len(day_models)) if daily_target is not None else None
    period_delta = (eaten - period_target) if period_target is not None else None
    return NutritionRangeResponse(
        start=start_day,
        end=end_day,
        days=day_models,
        targets=targets,
        daily_target_calories=daily_target,
        period_target_calories=round(period_target, 2) if period_target is not None else None,
        period_eaten_calories=round(eaten, 2),
        period_delta_calories=round(period_delta, 2) if period_delta is not None else None,
    )
