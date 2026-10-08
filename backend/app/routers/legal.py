"""Public texts and protected per-account legal acknowledgement endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.legal import LegalAcceptRequest, LegalDocument, LegalDocumentId, LegalStatus
from app.services.legal_consent import accept_documents, get_legal_status
from app.services.legal_documents import current_documents

router = APIRouter(prefix="/legal", tags=["legal"])


@router.get("/documents/{document_id}/{revision}", response_model=LegalDocument)
async def document_text(document_id: LegalDocumentId, revision: str) -> LegalDocument:
    for document in current_documents():
        if document.document_id == document_id and document.revision == revision:
            return document
    raise HTTPException(status_code=404, detail="Документ не найден")


@router.get("/status", response_model=LegalStatus)
async def legal_status(session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> LegalStatus:
    return await get_legal_status(session, user.id)


@router.post("/accept", response_model=LegalStatus)
async def legal_accept(body: LegalAcceptRequest, session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> LegalStatus:
    return await accept_documents(session, user.id, body)
