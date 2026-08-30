"""Persisted allowlisted snapshots for administrator system diagnostics."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AdminSystemSnapshot(Base):
    """One sanitized system-status observation without diagnostic facts or secrets."""

    __tablename__ = "admin_system_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    overall_status: Mapped[str] = mapped_column(String(16), nullable=False)
    item_statuses: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False, default=dict)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
