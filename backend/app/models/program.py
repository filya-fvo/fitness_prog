"""Program SQLAlchemy model."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class Program(Base, TimestampSoftDeleteMixin):
    """Training program with day-by-day JSON structure."""

    __tablename__ = "programs"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_level: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    duration_weeks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    structure: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    workout_type: Mapped[str] = mapped_column(Text, nullable=False, default="custom", server_default="custom")
    level: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
