"""Exercise SQLAlchemy model (fitness-tz.md §4)."""

from __future__ import annotations

from sqlalchemy import Integer, SmallInteger, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class Exercise(Base, TimestampSoftDeleteMixin):
    """Catalog exercise with media URLs and technique notes."""

    __tablename__ = "exercises"

    name_ru: Mapped[str] = mapped_column(Text, nullable=False)
    muscle_group: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    equipment: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    technique: Mapped[str | None] = mapped_column(Text, nullable=True)
    common_mistakes: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    animation_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    media_source: Mapped[str] = mapped_column(Text, nullable=False, default="none", server_default="none")
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # Local PG may store double precision[]; production uses vector(1536).
    # Not mapped for ORM reads in Sprint 2 (RAG lands in Sprint 4).
