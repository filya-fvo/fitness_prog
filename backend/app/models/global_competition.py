"""Opt-in global regularity seasons with pseudonymous participants."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GlobalCompetitionSeason(Base):
    __tablename__ = "global_competition_seasons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    season_key: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    metric: Mapped[str] = mapped_column(String(32), nullable=False, default="regularity")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    join_deadline: Mapped[date] = mapped_column(Date, nullable=False)
    algorithm_version: Mapped[str] = mapped_column(
        String(32), nullable=False, default="regularity_global_v1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class GlobalCompetitionParticipant(Base):
    __tablename__ = "global_competition_participants"
    __table_args__ = (
        UniqueConstraint("season_id", "user_id", name="uq_global_participant_user"),
        UniqueConstraint("season_id", "public_alias", name="uq_global_participant_alias"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("global_competition_seasons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    public_alias: Mapped[str] = mapped_column(String(32), nullable=False)
    cohort: Mapped[str] = mapped_column(String(16), nullable=False)
    consented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    schedule_days: Mapped[list[int]] = mapped_column(JSONB, nullable=False, default=list)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Moscow")
    ranked_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
