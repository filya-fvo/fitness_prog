"""Durable account-scoped revision feed and idempotency receipts."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AndroidSyncCursor(Base):
    __tablename__ = "android_sync_cursors"
    __table_args__ = (CheckConstraint("revision >= 0"),)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))


class AndroidSyncEntity(Base):
    __tablename__ = "android_sync_entities"
    __table_args__ = (
        CheckConstraint("kind IN ('workout','nutrition_log','measurement','product')"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(Text, primary_key=True)
    entity_id: Mapped[str] = mapped_column(Text, primary_key=True)
    revision: Mapped[int] = mapped_column(BigInteger)
    fingerprint: Mapped[str] = mapped_column(Text)
    deleted: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    payload: Mapped[dict] = mapped_column(JSONB)
    day: Mapped[date | None] = mapped_column(Date)


class AndroidSyncEvent(Base):
    __tablename__ = "android_sync_events"
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column(Text)
    deleted: Mapped[bool] = mapped_column(Boolean)
    payload: Mapped[dict] = mapped_column(JSONB)
    day: Mapped[date | None] = mapped_column(Date)


class AndroidSyncReceipt(Base):
    __tablename__ = "android_sync_receipts"
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    operation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(Text)
    result: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
