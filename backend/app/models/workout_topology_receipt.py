"""Idempotency record for one explicit active-workout edit."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WorkoutTopologyReceipt(Base):
    __tablename__ = "workout_topology_receipts"

    workout_id: Mapped[UUID] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"), primary_key=True)
    operation_id: Mapped[UUID] = mapped_column(primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
