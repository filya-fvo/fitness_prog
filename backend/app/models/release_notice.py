"""Immutable release announcement and account delivery receipts."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReleaseNotice(Base):
    __tablename__ = "release_notices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    release_key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    apk_url: Mapped[str] = mapped_column(Text, nullable=False)
    apk_version: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    apk_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    source_commit: Mapped[str] = mapped_column(String(40), nullable=False)
    shared_commit: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReleaseNoticeReceipt(Base):
    __tablename__ = "release_notice_receipts"
    __table_args__ = (
        CheckConstraint("channel IN ('telegram','browser','android')", name="release_notice_channel"),
        CheckConstraint("status IN ('pending','awaiting_open','sending','sent','partial','unknown','unavailable','skipped','seen')", name="release_notice_status"),
    )

    notice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("release_notices.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(40))
