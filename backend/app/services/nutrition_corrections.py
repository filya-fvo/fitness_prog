"""Personal KBJU edits and administrator review of shared catalog corrections."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nutrition import NutritionProduct
from app.models.nutrition_correction import NutritionCorrection
from app.models.nutrition_personal_value import NutritionPersonalValue
from app.models.user import User
from app.services import admin_audit

Kbju = dict[str, float]
Decision = Literal["approve", "reject"]
FIELDS = ("calories", "proteins", "fats", "carbs")


class CorrectionConflict(Exception):
    """The proposal has already been reviewed or the catalog changed meanwhile."""


def catalog_values(product: NutritionProduct) -> Kbju:
    return {key: float(getattr(product, key)) for key in FIELDS}


def needs_review(product: NutritionProduct, proposed: Kbju) -> bool:
    return any(Decimal(str(proposed[key])) != Decimal(str(getattr(product, key))) for key in FIELDS)


async def personal_values(
    session: AsyncSession, *, user_id: uuid.UUID, product_id: uuid.UUID,
) -> Kbju | None:
    values = await session.scalar(
        select(NutritionPersonalValue.kbju).where(
            NutritionPersonalValue.user_id == user_id,
            NutritionPersonalValue.product_id == product_id,
        )
    )
    return {key: float(values[key]) for key in FIELDS} if values else None


async def personal_values_map(
    session: AsyncSession, *, user_id: uuid.UUID, product_ids: list[uuid.UUID],
) -> dict[uuid.UUID, Kbju]:
    if not product_ids:
        return {}
    rows = await session.execute(
        select(NutritionPersonalValue.product_id, NutritionPersonalValue.kbju).where(
            NutritionPersonalValue.user_id == user_id,
            NutritionPersonalValue.product_id.in_(product_ids),
        )
    )
    return {
        product_id: {key: float(values[key]) for key in FIELDS}
        for product_id, values in rows.all()
    }


async def save_personal_values(
    session: AsyncSession, *, user_id: uuid.UUID, product_id: uuid.UUID, values: Kbju,
) -> None:
    stmt = pg_insert(NutritionPersonalValue).values(
        user_id=user_id, product_id=product_id,
        kbju={key: float(values[key]) for key in FIELDS},
    )
    await session.execute(stmt.on_conflict_do_update(
        index_elements=[NutritionPersonalValue.user_id, NutritionPersonalValue.product_id],
        set_={"kbju": stmt.excluded.kbju, "updated_at": func.now()},
    ))


def new_proposal(
    *, product: NutritionProduct, user_id: uuid.UUID, log_id: uuid.UUID, proposed: Kbju,
) -> NutritionCorrection:
    return NutritionCorrection(
        product_id=product.id,
        source_log_id=log_id,
        user_id=user_id,
        original_kbju=catalog_values(product),
        proposed_kbju={key: float(proposed[key]) for key in FIELDS},
        status="pending",
    )


def apply_review(
    correction: NutritionCorrection,
    product: NutritionProduct,
    decision: Decision,
    admin_id: uuid.UUID,
) -> None:
    if correction.status != "pending" or product.is_deleted:
        raise CorrectionConflict
    if decision == "approve":
        if catalog_values(product) != correction.original_kbju:
            raise CorrectionConflict
        for key in FIELDS:
            setattr(product, key, Decimal(str(correction.proposed_kbju[key])))
    correction.status = "approved" if decision == "approve" else "rejected"
    correction.reviewed_by_user_id = admin_id
    correction.reviewed_at = datetime.now(timezone.utc)


async def queue_from_log(
    session: AsyncSession,
    *,
    product: NutritionProduct,
    user_id: uuid.UUID,
    log_id: uuid.UUID,
    proposed: Kbju,
) -> None:
    current = await session.scalar(
        select(NutritionCorrection)
        .where(NutritionCorrection.source_log_id == log_id, NutritionCorrection.status == "pending")
        .with_for_update()
    )
    if not needs_review(product, proposed):
        if current is not None:
            current.status = "withdrawn"
        return
    values = {key: float(proposed[key]) for key in FIELDS}
    if current is not None:
        current.original_kbju = catalog_values(product)
        current.proposed_kbju = values
    else:
        session.add(new_proposal(product=product, user_id=user_id, log_id=log_id, proposed=values))


async def list_corrections(
    session: AsyncSession, *, status: str, limit: int, offset: int,
) -> tuple[list[tuple[NutritionCorrection, NutritionProduct, User]], int, int]:
    base = select(NutritionCorrection).where(NutritionCorrection.status == status)
    total = int(await session.scalar(select(func.count()).select_from(base.subquery())) or 0)
    pending = int(await session.scalar(
        select(func.count()).select_from(NutritionCorrection).where(NutritionCorrection.status == "pending")
    ) or 0)
    rows = await session.execute(
        select(NutritionCorrection, NutritionProduct, User)
        .join(NutritionProduct, NutritionProduct.id == NutritionCorrection.product_id)
        .join(User, User.id == NutritionCorrection.user_id)
        .where(NutritionCorrection.status == status)
        .order_by(NutritionCorrection.created_at.desc(), NutritionCorrection.id.desc())
        .offset(offset).limit(limit)
    )
    return list(rows.all()), total, pending


async def review_correction(
    session: AsyncSession, *, correction_id: uuid.UUID, decision: Decision,
    audit_context: admin_audit.AuditContext,
) -> tuple[NutritionCorrection, NutritionProduct]:
    correction = await session.scalar(
        select(NutritionCorrection).where(NutritionCorrection.id == correction_id).with_for_update()
    )
    if correction is None:
        raise LookupError
    product = await session.scalar(
        select(NutritionProduct).where(NutritionProduct.id == correction.product_id).with_for_update()
    )
    if product is None:
        raise CorrectionConflict
    before = catalog_values(product)
    apply_review(correction, product, decision, audit_context.actor_user_id)
    admin_audit.add_event(
        session,
        context=audit_context,
        action=f"nutrition.correction.{decision}",
        object_type="nutrition_product",
        object_id=product.id,
        result="success",
        description=f"{'Одобрено' if decision == 'approve' else 'Отклонено'} исправление БЖУ продукта",
        before={**before, "status": "pending"},
        after={**catalog_values(product), "status": correction.status},
    )
    await session.commit()
    await session.refresh(correction)
    return correction, product
