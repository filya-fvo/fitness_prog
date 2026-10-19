"""Individual facts and idempotency receipts for a compound set."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.workout import WorkoutSet
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class WorkoutSetPart(Base, TimestampSoftDeleteMixin):
    __tablename__ = "workout_set_parts"
    __table_args__ = (UniqueConstraint("workout_set_id", "ordinal", name="uq_workout_set_parts_ordinal"),)

    workout_set_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workout_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending", server_default="pending")
    rest_after_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    parent: Mapped["WorkoutSet"] = relationship("WorkoutSet", back_populates="parts")


class WorkoutSetExecutionReceipt(Base):
    __tablename__ = "workout_set_execution_receipts"

    workout_set_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workout_sets.id", ondelete="CASCADE"), primary_key=True)
    operation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    request_hash: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
