"""Public and service-level subscription contracts."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

EntitlementCode = Literal["plus"]
EntitlementSource = Literal[
    "beta_grant",
    "legacy_stars",
    "admin",
    "qa",
    "telegram_stars",
    "web_payment",
    "corporate",
    "promo",
    "partner",
]
SubscriptionTier = Literal["free", "plus"]


class SubscriptionState(BaseModel):
    """Safe effective access state returned to application clients."""

    tier: SubscriptionTier
    active: bool
    sources: list[EntitlementSource] = Field(default_factory=list)
    valid_until: datetime | None = None


class EntitlementRecord(BaseModel):
    """Bounded representation used by trusted service and later admin flows."""

    id: uuid.UUID
    user_id: uuid.UUID
    code: EntitlementCode
    source: EntitlementSource
    starts_at: datetime
    ends_at: datetime | None = None
    revoked_at: datetime | None = None
    external_reference: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
