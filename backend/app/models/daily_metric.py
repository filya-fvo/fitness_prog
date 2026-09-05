"""Daily manually entered wellbeing metrics."""

from __future__ import annotations

import uuid
from datetime import date
from sqlalchemy import Date, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class DailyMetric(Base, TimestampSoftDeleteMixin):
    """One user's editable summary for a local calendar day."""

    __tablename__ = "daily_metrics"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_daily_metrics_user_date"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    sleep_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Optional user-reported impact of cycle-related symptoms on today's training.
    cycle_readiness: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Per-field provenance keeps the schema ready for future HealthKit/Health Connect imports.
    sources: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
