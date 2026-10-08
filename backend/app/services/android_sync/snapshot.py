"""Canonical snapshots reuse existing response contracts; no public API rewrite."""

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.workout import Workout
from app.models.nutrition import NutritionLog, NutritionProduct
from app.models.body_measurement import BodyMeasurement
from app.models.user import User
from app.schemas.workout import WorkoutResponse
from app.schemas.nutrition import NutritionLogResponse
from app.routers.nutrition import _product_resp
from app.routers.body_measurements import _response
from app.services import nutrition_corrections

MAX_ROWS = 50000


async def snapshot(
    session: AsyncSession, user: User, known_products: set[str]
) -> dict[tuple[str, str], dict]:
    result = {}
    workouts = (
        (
            await session.scalars(
                select(Workout)
                .execution_options(populate_existing=True)
                .options(selectinload(Workout.sets))
                .where(Workout.user_id == user.id, Workout.is_deleted.is_(False))
                .limit(MAX_ROWS + 1)
            )
        )
        .unique()
        .all()
    )
    logs = (
        await session.scalars(
            select(NutritionLog)
            .execution_options(populate_existing=True)
            .where(NutritionLog.user_id == user.id, NutritionLog.is_deleted.is_(False))
            .limit(MAX_ROWS + 1)
        )
    ).all()
    measurements = (
        await session.scalars(
            select(BodyMeasurement)
            .execution_options(populate_existing=True)
            .where(
                BodyMeasurement.user_id == user.id,
                BodyMeasurement.is_deleted.is_(False),
            )
            .limit(MAX_ROWS + 1)
        )
    ).all()
    if any(len(rows) > MAX_ROWS for rows in (workouts, logs, measurements)):
        from fastapi import HTTPException

        raise HTTPException(413, "Дневник превышает лимит первой версии синхронизации")
    import uuid

    ids = {row.product_id for row in logs} | {uuid.UUID(v) for v in known_products}
    products, personal = [], {}
    product_ids = list(ids)
    # Bound both queries below asyncpg's 32767 argument limit, including
    # per-user nutrition values, without weakening the diary row limit.
    for start in range(0, len(product_ids), 1000):
        batch = product_ids[start : start + 1000]
        products.extend(
            (
                await session.scalars(
                    select(NutritionProduct)
                    .execution_options(populate_existing=True)
                    .where(NutritionProduct.id.in_(batch), NutritionProduct.is_deleted.is_(False))
                )
            ).all()
        )
        personal.update(
            await nutrition_corrections.personal_values_map(
                session, user_id=user.id, product_ids=batch
            )
        )
    product_map = {p.id: _product_resp(p, personal.get(p.id)) for p in products}
    for row in workouts:
        # Soft-deleted sets must not resurrect through parent aggregate.
        payload = WorkoutResponse.model_validate(row).model_dump(mode="json")
        live_ids = {str(s.id) for s in row.sets if not s.is_deleted}
        payload["sets"] = [s for s in payload["sets"] if s["id"] in live_ids]
        result[("workout", str(row.id))] = payload
    for row in logs:
        product = product_map.get(row.product_id)
        result[("nutrition_log", str(row.id))] = NutritionLogResponse(
            id=row.id,
            user_id=row.user_id,
            date=row.date,
            meal_type=row.meal_type,
            product_id=row.product_id,
            quantity_grams=float(row.quantity_grams),
            calculated_kbj=row.calculated_kbj or {},
            product=product,
        ).model_dump(mode="json")
    for row in measurements:
        result[("measurement", row.date.isoformat())] = _response(row, row.date).model_dump(
            mode="json"
        )
    for row in products:
        result[("product", str(row.id))] = product_map[row.id].model_dump(mode="json")
    return result
