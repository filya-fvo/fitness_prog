"""Independent legal-document acceptance contracts."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

LegalDocumentId = Literal["privacy", "consent", "offer"]


class LegalDocumentMeta(BaseModel):
    document_id: LegalDocumentId
    title: str
    revision: str
    text_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class LegalDocument(LegalDocumentMeta):
    text: str


class LegalDocumentStatus(LegalDocumentMeta):
    accepted_at: datetime | None = None


class LegalStatus(BaseModel):
    user_id: uuid.UUID
    accepted: bool
    documents: list[LegalDocumentStatus]


class LegalAcceptanceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: LegalDocumentId
    revision: str = Field(min_length=1, max_length=32)
    text_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    accepted: StrictBool

    @field_validator("accepted")
    @classmethod
    def require_explicit_true(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Нужно подтвердить документ отдельно")
        return value


class LegalAcceptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    documents: list[LegalAcceptanceInput] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def require_three_distinct_documents(self) -> LegalAcceptRequest:
        if {item.document_id for item in self.documents} != {"privacy", "consent", "offer"}:
            raise ValueError("Нужно подтвердить три разных документа")
        return self
