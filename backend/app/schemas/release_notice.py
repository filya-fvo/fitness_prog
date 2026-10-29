"""Bounded public release text and protected next-open response."""
import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

APK_URL = "https://app.filfitclub.ru/android/latest.apk"


class ReleaseNoticePublish(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    release_key: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")
    title: str = Field(min_length=1, max_length=80)
    message_text: str = Field(min_length=1, max_length=2000)
    apk_url: Literal[APK_URL] = APK_URL
    apk_version: int = Field(gt=0, strict=True)
    apk_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_commit: str = Field(pattern=r"^[0-9a-f]{40}$")
    shared_commit: str = Field(pattern=r"^[0-9a-f]{40}$")

    @field_validator("title", "message_text")
    @classmethod
    def plain_text(cls, value: str) -> str:
        if any(ord(char) < 32 and char not in "\n\t" for char in value):
            raise ValueError("Unsupported control character")
        return value


    @model_validator(mode="after")
    def fits_web_push(self):
        payload = {"title": self.title, "body": self.message_text, "url": "/", "tag": "release-" + "0" * 36}
        if len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) > 3000:
            raise ValueError("Release text exceeds the browser push byte budget")
        return self


class ReleaseNoticeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    release_key: str
    title: str
    message_text: str
    apk_url: Literal[APK_URL]
    created_at: datetime


class ReleaseNoticesResponse(BaseModel):
    items: list[ReleaseNoticeItem]
