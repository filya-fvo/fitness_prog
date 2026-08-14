"""User SQLAlchemy model (fitness-tz.md §4 users)."""

from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin

subscription_status_enum = ENUM(
    "free",
    "pro_stars",
    name="subscription_status",
    create_type=False,
)


class User(Base, TimestampSoftDeleteMixin):
    """Application user linked to Telegram account."""

    __tablename__ = "users"

    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True, index=True)
    username: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_email: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    # Provider-side conversation id; never use a mutable Telegram username as the key.
    openai_conversation_id: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    merged_into_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    anthropometry: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    goals: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    subscription_status: Mapped[str] = mapped_column(
        subscription_status_enum,
        nullable=False,
        default="free",
        server_default="free",
    )
    stars_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
