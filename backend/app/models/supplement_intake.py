"""Scheduled supplement intake and browser push subscription models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class SupplementIntake(Base, TimestampSoftDeleteMixin):
    __tablename__ = "supplement_intakes"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "supplement_entry_id",
            "scheduled_at",
            name="uq_supplement_intake_slot",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    supplement_entry_id: Mapped[str] = mapped_column(Text, nullable=False)
    supplement_key: Mapped[str] = mapped_column(Text, nullable=False)
    name_ru: Mapped[str] = mapped_column(Text, nullable=False)
    dose: Mapped[str] = mapped_column(Text, nullable=False, default="")
    slot: Mapped[str] = mapped_column(Text, nullable=False)
    days_mode: Mapped[str] = mapped_column(Text, nullable=False, default="every")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)


class WebPushSubscription(Base, TimestampSoftDeleteMixin):
    __tablename__ = "web_push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
