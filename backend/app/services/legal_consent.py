"""Explicit, versioned and idempotent acknowledgements of the current texts."""
from __future__ import annotations

import uuid
from datetime import timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legal_acceptance import LegalAcceptance
from app.schemas.legal import LegalAcceptRequest, LegalDocumentStatus, LegalStatus
from app.services.legal_documents import current_documents


def _stale_document() -> HTTPException:
    return HTTPException(status_code=409, detail="Редакция документов изменилась. Обновите страницу и проверьте тексты.")


async def get_legal_status(session: AsyncSession, user_id: uuid.UUID) -> LegalStatus:
    result = await session.execute(select(LegalAcceptance).where(LegalAcceptance.user_id == user_id))
    receipts = {(row.document_id, row.revision, row.text_sha256): row.accepted_at for row in result.scalars()}
    statuses = []
    for document in current_documents():
        accepted_at = receipts.get((document.document_id, document.revision, document.text_sha256))
        if accepted_at is not None and accepted_at.tzinfo is None:
            accepted_at = accepted_at.replace(tzinfo=timezone.utc)
        statuses.append(LegalDocumentStatus(**document.model_dump(exclude={"text"}), accepted_at=accepted_at))
    return LegalStatus(user_id=user_id, accepted=all(doc.accepted_at is not None for doc in statuses), documents=statuses)


async def accept_documents(session: AsyncSession, user_id: uuid.UUID, body: LegalAcceptRequest) -> LegalStatus:
    current = {doc.document_id: doc for doc in current_documents()}
    for entry in body.documents:
        document = current[entry.document_id]
        if entry.revision != document.revision or entry.text_sha256 != document.text_sha256:
            raise _stale_document()
    values = [dict(user_id=user_id, document_id=entry.document_id, revision=entry.revision, text_sha256=entry.text_sha256) for entry in body.documents]
    try:
        await session.execute(insert(LegalAcceptance).values(values).on_conflict_do_nothing(index_elements=["user_id", "document_id", "revision"]))
        status = await get_legal_status(session, user_id)
        if not status.accepted:
            raise _stale_document()
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return status
