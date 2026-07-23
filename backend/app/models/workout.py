"""Workout and WorkoutSet models (fitness-tz.md §4)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin

workout_status_enum = ENUM(
    "planned",
    "completed",
    "skipped",
    name="workout_status",
    create_type=False,
)


class Workout(Base, TimestampSoftDeleteMixin):
    """Single scheduled/completed workout instance for a user."""

    __tablename__ = "workouts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("programs.id"),
        nullable=True,
        index=True,
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        workout_status_enum,
        nullable=False,
        default="planned",
        server_default="planned",
    )
    ai_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rpe: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    workout_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)

    sets: Mapped[list[WorkoutSet]] = relationship(
        "WorkoutSet",
        back_populates="workout",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class WorkoutSet(Base, TimestampSoftDeleteMixin):
    """One set inside a workout for a specific exercise."""

    __tablename__ = "workout_sets"
    __table_args__ = (
        UniqueConstraint("workout_id", "exercise_id", "set_number", name="uq_workout_sets_slot"),
    )

    workout_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workouts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exercises.id"),
        nullable=False,
        index=True,
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rest_time_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)

    workout: Mapped[Workout] = relationship("Workout", back_populates="sets")
