"""Versioned, account-scoped Android sync contracts."""

from typing import Literal
from pydantic import BaseModel, Field, ConfigDict
import uuid

Kind = Literal["workout", "nutrition_log", "measurement", "product"]


class Operation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    owner: uuid.UUID
    kind: Kind
    entityId: str = Field(min_length=1, max_length=64)
    action: Literal["create", "update", "delete", "set", "plan", "complete", "upsert"]
    body: dict = Field(default_factory=dict)
    baseRevision: str | None = Field(default=None, pattern=r"^[0-9]+$")
    createdAt: int = Field(ge=0)


class Entity(BaseModel):
    key: str
    owner: str
    kind: Kind
    id: str
    revision: str
    deleted: bool
    unavailable: bool = False
    data: dict


class PushResult(BaseModel):
    operationId: str
    entity: Entity
    response: dict | None = None
