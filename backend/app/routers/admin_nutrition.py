"""Administrator queue for food catalog corrections proposed from diary edits."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import require_admin
from app.models.nutrition import NutritionProduct
from app.models.nutrition_correction import NutritionCorrection
from app.models.user import User
from app.schemas.nutrition_correction import (
    CorrectionStatus,
    NutritionCorrectionDecision,
    NutritionCorrectionListResponse,
    NutritionCorrectionResponse,
)
from app.services import admin_audit, nutrition_corrections

router = APIRouter(prefix="/admin/nutrition", tags=["admin-nutrition"])


def _response(correction: NutritionCorrection, product: NutritionProduct) -> NutritionCorrectionResponse:
    return NutritionCorrectionResponse(
        id=correction.id,
        product_id=correction.product_id,
        product_name=product.name_ru,
        user_id=correction.user_id,
        original_kbju=correction.original_kbju,
        proposed_kbju=correction.proposed_kbju,
        status=correction.status,
        created_at=correction.created_at,
        reviewed_at=correction.reviewed_at,
    )


@router.get("/corrections", response_model=NutritionCorrectionListResponse)
async def list_corrections(
    status: CorrectionStatus = "pending",
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> NutritionCorrectionListResponse:
    rows, total, pending = await nutrition_corrections.list_corrections(
        session, status=status, limit=limit, offset=offset,
    )
    return NutritionCorrectionListResponse(
        items=[_response(correction, product) for correction, product, _user in rows],
        total=total,
        pending_count=pending,
    )


@router.post("/corrections/{correction_id}/decision", response_model=NutritionCorrectionResponse)
async def decide_correction(
    correction_id: uuid.UUID,
    body: NutritionCorrectionDecision,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> NutritionCorrectionResponse:
    try:
        correction, product = await nutrition_corrections.review_correction(
            session,
            correction_id=correction_id,
            decision=body.decision,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Исправление не найдено") from exc
    except nutrition_corrections.CorrectionConflict as exc:
        raise HTTPException(status_code=409, detail="Каталог изменился или заявка уже рассмотрена") from exc
    return _response(correction, product)
