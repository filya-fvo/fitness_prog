"""Dated body circumference measurements."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class BodyMeasurement(Base, TimestampSoftDeleteMixin):
    __tablename__ = "body_measurements"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_body_measurements_user_date"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    neck_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    shoulders_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    chest_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    waist_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    hips_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    bicep_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    thigh_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    calf_cm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    sources: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
