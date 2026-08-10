"""Nutrition business logic — KBJU math is rule-based (TZ §6)."""

from __future__ import annotations

import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

import httpx
from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.nutrition import NutritionLog, NutritionProduct
from app.models.user import User
from app.schemas.nutrition import NutritionLogCreate, NutritionLogUpdate

_BARCODE_RE = re.compile(r"^\d{8,14}$")


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

    cal = data.calories_per_100 if data.calories_per_100 is not None else product.calories
    prot = data.proteins_per_100 if data.proteins_per_100 is not None else product.proteins
    fat = data.fats_per_100 if data.fats_per_100 is not None else product.fats
    carb = data.carbs_per_100 if data.carbs_per_100 is not None else product.carbs
    kbj = calc_kbju(
        calories_per_100=cal,
        proteins_per_100=prot,
        fats_per_100=fat,
        carbs_per_100=carb,
        quantity_grams=data.quantity_grams,
    )
    # Keep override snapshot for UI/history
    if any(
        x is not None
        for x in (
            data.calories_per_100,
            data.proteins_per_100,
            data.fats_per_100,
            data.carbs_per_100,
        )
    ):
        kbj["per_100_override"] = {
            "calories": float(cal),
            "proteins": float(prot),
            "fats": float(fat),
            "carbs": float(carb),
        }
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


async def get_user_log(
    session: AsyncSession,
    user: User,
    log_id: uuid.UUID,
) -> NutritionLog | None:
    return await session.scalar(
        select(NutritionLog).where(
            NutritionLog.id == log_id,
            NutritionLog.user_id == user.id,
            NutritionLog.is_deleted.is_(False),
        )
    )


async def update_log(
    session: AsyncSession,
    user: User,
    log_id: uuid.UUID,
    data: NutritionLogUpdate,
) -> NutritionLog:
    row = await get_user_log(session, user, log_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")

    product = await session.scalar(
        select(NutritionProduct).where(
            NutritionProduct.id == row.product_id,
            NutritionProduct.is_deleted.is_(False),
        )
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if data.quantity_grams is not None:
        row.quantity_grams = data.quantity_grams
    if data.meal_type is not None:
        row.meal_type = data.meal_type

    prev = row.calculated_kbj if isinstance(row.calculated_kbj, dict) else {}
    prev_ov = prev.get("per_100_override") if isinstance(prev.get("per_100_override"), dict) else {}

    def _pick(new_val: float | None, key: str, fallback: Any) -> Any:
        if new_val is not None:
            return new_val
        if key in prev_ov and prev_ov[key] is not None:
            return prev_ov[key]
        return fallback

    # If any override field is sent, rebuild override snapshot; else keep previous override if any.
    touch_override = any(
        x is not None
        for x in (
            data.calories_per_100,
            data.proteins_per_100,
            data.fats_per_100,
            data.carbs_per_100,
        )
    )
    if touch_override or prev_ov:
        cal = _pick(data.calories_per_100, "calories", product.calories)
        prot = _pick(data.proteins_per_100, "proteins", product.proteins)
        fat = _pick(data.fats_per_100, "fats", product.fats)
        carb = _pick(data.carbs_per_100, "carbs", product.carbs)
    else:
        cal, prot, fat, carb = product.calories, product.proteins, product.fats, product.carbs

    kbj = calc_kbju(
        calories_per_100=cal,
        proteins_per_100=prot,
        fats_per_100=fat,
        carbs_per_100=carb,
        quantity_grams=row.quantity_grams,
    )
    if touch_override or prev_ov:
        kbj["per_100_override"] = {
            "calories": float(cal),
            "proteins": float(prot),
            "fats": float(fat),
            "carbs": float(carb),
        }
    row.calculated_kbj = kbj
    flag_modified(row, "calculated_kbj")
    await session.commit()
    await session.refresh(row)
    return row


async def delete_log(
    session: AsyncSession,
    user: User,
    log_id: uuid.UUID,
) -> None:
    row = await get_user_log(session, user, log_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    row.is_deleted = True
    await session.commit()


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


def normalize_barcode(raw: str | None) -> str:
    code = re.sub(r"\D", "", str(raw or "").strip())
    return code


def is_valid_barcode(code: str) -> bool:
    return bool(_BARCODE_RE.match(code or ""))


async def get_product_by_barcode(
    session: AsyncSession,
    barcode: str,
) -> NutritionProduct | None:
    code = normalize_barcode(barcode)
    if not code:
        return None
    return await session.scalar(
        select(NutritionProduct).where(
            NutritionProduct.is_deleted.is_(False),
            NutritionProduct.barcode == code,
        )
    )


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return max(0.0, float(v))
    except (TypeError, ValueError):
        return default


async def fetch_openfoodfacts(barcode: str) -> dict[str, Any] | None:
    """Lookup product macros on Open Food Facts (per 100g)."""
    code = normalize_barcode(barcode)
    if not is_valid_barcode(code):
        return None
    url = f"https://world.openfoodfacts.org/api/v2/product/{code}.json"
    headers = {
        "User-Agent": "FitnessProgMiniApp/1.0 (nutrition barcode lookup)",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=12.0, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            payload = resp.json()
    except Exception as exc:
        logger.warning("openfoodfacts_lookup_failed barcode={} err={}", code, exc)
        return None

    if int(payload.get("status") or 0) != 1:
        return None
    product = payload.get("product") or {}
    if not isinstance(product, dict):
        return None

    nutriments = product.get("nutriments") or {}
    if not isinstance(nutriments, dict):
        nutriments = {}

    calories = _num(
        nutriments.get("energy-kcal_100g", nutriments.get("energy-kcal")),
        default=-1.0,
    )
    if calories < 0:
        # kJ → kcal fallback
        kj = _num(nutriments.get("energy-kj_100g", nutriments.get("energy")), default=-1.0)
        calories = round(kj / 4.184, 2) if kj >= 0 else 0.0

    proteins = _num(nutriments.get("proteins_100g", nutriments.get("proteins")))
    fats = _num(nutriments.get("fat_100g", nutriments.get("fat")))
    carbs = _num(nutriments.get("carbohydrates_100g", nutriments.get("carbohydrates")))

    name = (
        str(product.get("product_name_ru") or "").strip()
        or str(product.get("product_name") or "").strip()
        or str(product.get("generic_name_ru") or "").strip()
        or str(product.get("generic_name") or "").strip()
        or f"Товар {code}"
    )
    brands = str(product.get("brands") or "").strip()
    if brands and brands.lower() not in name.lower():
        name = f"{name} ({brands})"

    cats_raw = str(product.get("categories_tags") or product.get("categories") or "")
    category = "ready"
    low = cats_raw.lower()
    if "dairy" in low or "milk" in low or "yogurt" in low:
        category = "dairy"
    elif "beverage" in low or "drink" in low:
        category = "drinks"
    elif "meat" in low:
        category = "meat"
    elif "fish" in low or "seafood" in low:
        category = "fish"
    elif "fruit" in low:
        category = "fruit"
    elif "vegetable" in low:
        category = "veg"
    elif "cereal" in low or "bread" in low:
        category = "grains"
    elif "snack" in low or "sweet" in low or "chocolate" in low:
        category = "sweets"

    serving = _num(product.get("serving_quantity"), default=0.0)
    if serving <= 0:
        serving_size = str(product.get("serving_size") or "")
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*g", serving_size, flags=re.I)
        if m:
            serving = _num(m.group(1).replace(",", "."), default=0.0)

    return {
        "barcode": code,
        "name_ru": name[:200],
        "calories": round(min(1200.0, calories), 2),
        "proteins": round(min(100.0, proteins), 2),
        "fats": round(min(100.0, fats), 2),
        "carbs": round(min(100.0, carbs), 2),
        "category": category,
        "serving_grams": round(serving, 1) if serving > 0 else None,
        "source": "openfoodfacts",
    }


async def create_product(
    session: AsyncSession,
    *,
    name_ru: str,
    calories: float,
    proteins: float,
    fats: float,
    carbs: float,
    category: str | None = "custom",
    barcode: str | None = None,
    source: str = "manual",
) -> NutritionProduct:
    name = (name_ru or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name_ru required")
    code = normalize_barcode(barcode) or None
    if code:
        existing = await get_product_by_barcode(session, code)
        if existing is not None:
            return existing
    src = source if source in {"manual", "openfoodfacts"} else "manual"
    row = NutritionProduct(
        name_ru=name,
        barcode=code,
        calories=Decimal(str(round(float(calories), 2))),
        proteins=Decimal(str(round(float(proteins), 2))),
        fats=Decimal(str(round(float(fats), 2))),
        carbs=Decimal(str(round(float(carbs), 2))),
        category=(category or "custom").strip() or "custom",
        source=src,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def lookup_barcode(
    session: AsyncSession,
    barcode: str,
    *,
    fetch_remote: bool = True,
) -> tuple[NutritionProduct | None, dict[str, Any]]:
    """
    Resolve barcode to a catalog product.
    1) local DB
    2) Open Food Facts (+ cache into nutrition_products)
    Returns (product|None, meta).
    """
    code = normalize_barcode(barcode)
    meta: dict[str, Any] = {"barcode": code, "found": False, "source": None, "serving_grams": None}
    if not is_valid_barcode(code):
        meta["error"] = "invalid_barcode"
        return None, meta

    local = await get_product_by_barcode(session, code)
    if local is not None:
        meta.update({"found": True, "source": local.source or "local"})
        return local, meta

    if not fetch_remote:
        meta["error"] = "not_found"
        return None, meta

    remote = await fetch_openfoodfacts(code)
    if not remote:
        meta["error"] = "not_found"
        return None, meta

    row = await create_product(
        session,
        name_ru=str(remote["name_ru"]),
        calories=float(remote["calories"]),
        proteins=float(remote["proteins"]),
        fats=float(remote["fats"]),
        carbs=float(remote["carbs"]),
        category=str(remote.get("category") or "ready"),
        barcode=code,
        source="openfoodfacts",
    )
    meta.update(
        {
            "found": True,
            "source": "openfoodfacts",
            "serving_grams": remote.get("serving_grams"),
            "created": True,
        }
    )
    return row, meta
