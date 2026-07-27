"""User SQLAlchemy model (fitness-tz.md §4 users)."""

from __future__ import annotations

from sqlalchemy import BigInteger, Integer, String, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
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
    anthropometry: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    goals: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    subscription_status: Mapped[str] = mapped_column(
        subscription_status_enum,
        nullable=False,
        default="free",
        server_default="free",
    )
    stars_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
