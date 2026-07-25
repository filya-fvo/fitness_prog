"""Nutrition business logic — KBJU math is rule-based (TZ §6)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nutrition import NutritionLog, NutritionProduct
from app.models.user import User
from app.schemas.nutrition import NutritionLogCreate


def calc_kbju(
    *,
    calories_per_100: Decimal | float,
    proteins_per_100: Decimal | float,
    fats_per_100: Decimal | float,
    carbs_per_100: Decimal | float,
    quantity_grams: Decimal | float,
) -> dict[str, float]:
    q = Decimal(str(quantity_grams))
    factor = q / Decimal("100")
    return {
        "calories": float((Decimal(str(calories_per_100)) * factor).quantize(Decimal("0.01"))),
        "proteins": float((Decimal(str(proteins_per_100)) * factor).quantize(Decimal("0.01"))),
        "fats": float((Decimal(str(fats_per_100)) * factor).quantize(Decimal("0.01"))),
        "carbs": float((Decimal(str(carbs_per_100)) * factor).quantize(Decimal("0.01"))),
    }


async def search_products(
    session: AsyncSession,
    *,
    q: str,
    category: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[NutritionProduct], int]:
    query = select(NutritionProduct).where(NutritionProduct.is_deleted.is_(False))
    count_q = select(func.count()).select_from(NutritionProduct).where(
        NutritionProduct.is_deleted.is_(False)
    )
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        filt = or_(
            NutritionProduct.name_ru.ilike(like),
            NutritionProduct.barcode == term,
            NutritionProduct.category.ilike(like),
        )
        query = query.where(filt)
        count_q = count_q.where(filt)

    cat = (category or "").strip()
    if cat:
        query = query.where(NutritionProduct.category == cat)
        count_q = count_q.where(NutritionProduct.category == cat)

    total = int(await session.scalar(count_q) or 0)
    result = await session.scalars(
        query.order_by(NutritionProduct.name_ru.asc()).offset(max(0, offset)).limit(limit)
    )
    return list(result.all()), total


async def list_categories(session: AsyncSession) -> list[str]:
    rows = await session.scalars(
        select(NutritionProduct.category)
        .where(
            NutritionProduct.is_deleted.is_(False),
            NutritionProduct.category.is_not(None),
            NutritionProduct.category != "",
        )
        .distinct()
        .order_by(NutritionProduct.category.asc())
    )
    return [str(c) for c in rows.all() if c]


async def add_log(
    session: AsyncSession,
    user: User,
    data: NutritionLogCreate,
) -> NutritionLog:
    product = await session.scalar(
        select(NutritionProduct).where(
            NutritionProduct.id == data.product_id,
            NutritionProduct.is_deleted.is_(False),
        )
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    kbj = calc_kbju(
        calories_per_100=product.calories,
        proteins_per_100=product.proteins,
        fats_per_100=product.fats,
        carbs_per_100=product.carbs,
        quantity_grams=data.quantity_grams,
    )
    row = NutritionLog(
        user_id=user.id,
        date=data.log_date or date.today(),
        meal_type=data.meal_type,
        product_id=product.id,
        quantity_grams=data.quantity_grams,
        calculated_kbj=kbj,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def daily_summary(
    session: AsyncSession,
    user: User,
    day: date,
) -> tuple[list[NutritionLog], dict[str, float]]:
    result = await session.scalars(
        select(NutritionLog)
        .where(
            NutritionLog.user_id == user.id,
            NutritionLog.date == day,
            NutritionLog.is_deleted.is_(False),
        )
        .order_by(NutritionLog.created_at.asc())
    )
    logs = list(result.all())
    totals = {"calories": 0.0, "proteins": 0.0, "fats": 0.0, "carbs": 0.0}
    for log in logs:
        k = log.calculated_kbj or {}
        for key in totals:
            totals[key] += float(k.get(key, 0) or 0)
    for key in totals:
        totals[key] = round(totals[key], 2)
    return logs, totals


async def range_daily_totals(
    session: AsyncSession,
    user: User,
    *,
    start: date,
    end: date,
) -> list[dict[str, float | str | bool]]:
    """Per-day calorie/macro totals for [start, end] inclusive (empty days included)."""
    if end < start:
        start, end = end, start
    result = await session.scalars(
        select(NutritionLog)
        .where(
            NutritionLog.user_id == user.id,
            NutritionLog.date >= start,
            NutritionLog.date <= end,
            NutritionLog.is_deleted.is_(False),
        )
        .order_by(NutritionLog.date.asc(), NutritionLog.created_at.asc())
    )
    logs = list(result.all())
    by_day: dict[date, dict[str, float]] = {}
    cursor = start
    while cursor <= end:
        by_day[cursor] = {"calories": 0.0, "proteins": 0.0, "fats": 0.0, "carbs": 0.0}
        cursor = date.fromordinal(cursor.toordinal() + 1)

    for log in logs:
        bucket = by_day.get(log.date)
        if bucket is None:
            continue
        k = log.calculated_kbj or {}
        for key in bucket:
            bucket[key] += float(k.get(key, 0) or 0)

    out: list[dict[str, float | str | bool]] = []
    for day_key in sorted(by_day.keys()):
        totals = by_day[day_key]
        has_logs = any(v > 0 for v in totals.values())
        out.append(
            {
                "date": day_key.isoformat(),
                "calories": round(float(totals["calories"]), 2),
                "proteins": round(float(totals["proteins"]), 2),
                "fats": round(float(totals["fats"]), 2),
                "carbs": round(float(totals["carbs"]), 2),
                "has_logs": has_logs,
            }
        )
    return out


async def get_products_map(
    session: AsyncSession,
    product_ids: list[uuid.UUID],
) -> dict[uuid.UUID, NutritionProduct]:
    if not product_ids:
        return {}
    result = await session.scalars(
        select(NutritionProduct).where(NutritionProduct.id.in_(product_ids))
    )
    return {p.id: p for p in result.all()}
