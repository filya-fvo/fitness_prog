"""Admin review contract for shared nutrition product corrections."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

CorrectionStatus = Literal["pending", "approved", "rejected", "withdrawn"]


class NutritionCorrectionDecision(BaseModel):
    decision: Literal["approve", "reject"]


class NutritionCorrectionResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    user_id: uuid.UUID
    original_kbju: dict[str, float]
    proposed_kbju: dict[str, float]
    status: CorrectionStatus
    created_at: datetime
    reviewed_at: datetime | None = None


class NutritionCorrectionListResponse(BaseModel):
    items: list[NutritionCorrectionResponse]
    total: int
    pending_count: int
