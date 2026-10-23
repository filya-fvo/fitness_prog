"""Authenticated bot linking; client never supplies Telegram actor identity."""

from typing import Literal
from uuid import UUID
from app.schemas.android_login import AndroidLoginProof
from app.schemas.auth import EmailLinkResponse


class TelegramLinkComplete(AndroidLoginProof):
    merge_preference: Literal["email", "telegram"] | None = None
    merge_target_id: UUID | None = None


class TelegramLinkResponse(EmailLinkResponse):
    access_token: str | None = None
    merge_target_id: UUID | None = None
