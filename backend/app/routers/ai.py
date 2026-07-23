"""AI trainer routes — rate limited 15/day."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.rate_limiter import RateLimitExceeded, consume_ai_quota
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.ai import (
    AIAnalyzeRequest,
    AIAnalyzeResponse,
    AIChatRequest,
    AIChatResponse,
)
from app.services import ai_engine

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    body: AIChatRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> AIChatResponse:
    try:
        remaining = await consume_ai_quota(str(user.id), settings)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI daily limit reached (15 requests)",
        ) from exc

    sid, reply, source = await ai_engine.chat(
        session,
        user,
        message=body.message,
        session_id=body.session_id,
        settings=settings,
    )
    return AIChatResponse(
        session_id=sid,
        reply=reply,
        source=source,
        remaining_requests=remaining,
    )


@router.post("/analyze", response_model=AIAnalyzeResponse)
async def ai_analyze(
    body: AIAnalyzeRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> AIAnalyzeResponse:
    try:
        remaining = await consume_ai_quota(str(user.id), settings)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI daily limit reached (15 requests)",
        ) from exc

    report, source = await ai_engine.analyze_progress(
        session,
        user,
        days=body.days,
        settings=settings,
    )
    return AIAnalyzeResponse(
        report=report,
        source=source,
        remaining_requests=remaining,
    )
