"""Short-lived, PKCE-bound Telegram bot login requests; never stores JWTs."""

import uuid
from datetime import datetime
from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AndroidLogin(Base):
    __tablename__ = "android_login_requests"
    __table_args__ = (
        CheckConstraint(
            "(purpose = 'login' AND owner_user_id IS NULL) OR (purpose = 'link' AND owner_user_id IS NOT NULL)",
            name="android_login_request_purpose",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purpose: Mapped[str] = mapped_column(
        String(16), nullable=False, default="login", server_default="login"
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
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
