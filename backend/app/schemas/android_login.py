import uuid
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class AndroidLoginStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    challenge: str = Field(pattern=r"^[0-9a-f]{64}$")


class AndroidLoginProof(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: uuid.UUID
    verifier: str = Field(min_length=43, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class AndroidLoginStarted(BaseModel):
    request_id: uuid.UUID
    bot_url: str
    expires_in_sec: int


class AndroidLoginStatus(BaseModel):
    state: Literal["waiting", "ready"]
    display_name: str | None = None
