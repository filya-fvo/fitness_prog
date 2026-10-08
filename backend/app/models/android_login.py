"""Short-lived, PKCE-bound Telegram bot login requests; never stores JWTs."""

import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AndroidLogin(Base):
    __tablename__ = "android_login_requests"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    link_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    challenge: Mapped[str] = mapped_column(String(64), nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    telegram_id: Mapped[int | None] = mapped_column(BigInteger)
    actor: Mapped[dict | None] = mapped_column(JSON)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
