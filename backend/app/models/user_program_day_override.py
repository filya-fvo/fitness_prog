"""Private deltas on a pinned program day, optionally restricted to one date."""
from datetime import date
from uuid import UUID as PythonUUID

from sqlalchemy import Date, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin


class UserProgramDayOverride(Base, TimestampSoftDeleteMixin):
    __tablename__ = "user_program_day_overrides"
    __table_args__ = (UniqueConstraint(
        "user_id", "program_id", "day_index", "scheduled_date",
        name="uq_user_program_day_overrides_slot", postgresql_nulls_not_distinct=True,
    ),)
    user_id: Mapped[PythonUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    program_id: Mapped[PythonUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("programs.id", ondelete="CASCADE"), nullable=False, index=True)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    program_version: Mapped[int] = mapped_column(Integer, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    patch: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_operation_id: Mapped[PythonUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    last_operation_hash: Mapped[str] = mapped_column(Text, nullable=False)
