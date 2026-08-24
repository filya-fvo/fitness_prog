"""Exercise replacements prepared before a program workout starts."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class WorkoutPlanOverride(Base, TimestampSoftDeleteMixin):
    """A date-scoped replacement draft consumed when the workout is created."""

    __tablename__ = "workout_plan_overrides"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "program_id",
            "scheduled_date",
            "day_index",
            name="uq_workout_plan_overrides_slot",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    week_phase: Mapped[str | None] = mapped_column(Text, nullable=True)
    replacements: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
