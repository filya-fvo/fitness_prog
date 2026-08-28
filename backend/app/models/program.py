"""Program SQLAlchemy model."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
    publication_status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="draft",
        server_default="draft",
    )
    program_key: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        index=True,
        default=lambda: f"custom-{uuid.uuid4().hex}",
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_current: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
