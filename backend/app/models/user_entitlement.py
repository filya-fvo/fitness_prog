"""Time-bounded feature entitlements owned by an application user."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserEntitlement(Base):
    """One independently granted entitlement such as temporary PLUS access."""

    __tablename__ = "user_entitlements"
    __table_args__ = (
        CheckConstraint("code IN ('plus')", name="ck_user_entitlements_code"),
        CheckConstraint(
            "source IN ("
            "'beta_grant', 'legacy_stars', 'admin', 'qa', 'telegram_stars', "
            "'web_payment', 'corporate', 'promo', 'partner'"
            ")",
            name="ck_user_entitlements_source",
        ),
        CheckConstraint(
            "ends_at IS NULL OR ends_at > starts_at",
            name="ck_user_entitlements_time_window",
        ),
        CheckConstraint(
            "jsonb_typeof(metadata) = 'object'",
            name="ck_user_entitlements_metadata_object",
        ),
        Index(
            "idx_user_entitlements_active",
            "user_id",
            "code",
            "starts_at",
            "ends_at",
            postgresql_where=text("revoked_at IS NULL"),
        ),
        Index(
            "uq_user_entitlements_external_reference",
            "source",
            "external_reference",
            unique=True,
            postgresql_where=text("external_reference IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
