"""AI trainer routes with a configurable per-user daily limit."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.rate_limiter import (
    RateLimitBackendUnavailable,
    RateLimitExceeded,
    consume_ai_quota,
)
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.ai_conversation import AIConversation
from app.schemas.ai import (
    AIAnalyzeRequest,
    AIAnalyzeResponse,
    AIChatRequest,
    AIChatResponse,
    AIHistoryResponse,
    AIMessageResponse,
)
from app.services import ai_engine

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/history", response_model=AIHistoryResponse)
async def ai_history(
    day: date = Query(...),
    timezone_offset_minutes: int = Query(default=0, ge=-840, le=840),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIHistoryResponse:
    """Return the user's messages for one local calendar day without consuming AI quota."""
    local_tz = timezone(timedelta(minutes=-timezone_offset_minutes))
    start = datetime.combine(day, time.min, tzinfo=local_tz).astimezone(UTC)
    end = start + timedelta(days=1)
    rows = list(
        (
            await session.scalars(
                select(AIConversation)
                .where(
                    AIConversation.user_id == user.id,
                    AIConversation.timestamp >= start,
                    AIConversation.timestamp < end,
                    AIConversation.is_deleted.is_(False),
                )
                .order_by(AIConversation.timestamp.desc())
                .limit(200)
            )
        ).all()
    )
    rows.reverse()
    latest_session_id = rows[-1].session_id if rows else None
    return AIHistoryResponse(
        session_id=latest_session_id,
        messages=[AIMessageResponse.model_validate(item) for item in rows],
    )


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
            detail=(
                f"Дневной лимит ИИ исчерпан ({settings.ai_daily_limit} запросов). "
                "Он обновится завтра."
            ),
        ) from exc
    except RateLimitBackendUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис ограничения запросов ИИ временно недоступен",
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
            detail=(
                f"Дневной лимит ИИ исчерпан ({settings.ai_daily_limit} запросов). "
                "Он обновится завтра."
            ),
        ) from exc
    except RateLimitBackendUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис ограничения запросов ИИ временно недоступен",
        ) from exc

    report, source = await ai_engine.analyze_progress(
        session,
        user,
        days=body.days,
        settings=settings,
    )
    history_session_id: uuid.UUID | None = None
    if body.message:
        history_session_id = body.session_id or uuid.uuid4()
        await ai_engine.store_exchange(
            session,
            user_id=user.id,
            session_id=history_session_id,
            user_content=body.message,
            assistant_content=report,
        )
    return AIAnalyzeResponse(
        report=report,
        source=source,
        session_id=history_session_id,
        remaining_requests=remaining,
    )
