"""AI trainer routes backed by the unlimited local inference service."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.ai_conversation import AIConversation
from app.models.user import User
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
    """Return the user's messages for one local calendar day."""
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
    messages: list[AIMessageResponse] = []
    for item in rows:
        content = item.content
        if item.role == "assistant":
            content = ai_engine.sanitize_ai_output(content) or (
                "Старый ответ скрыт, потому что содержал служебный текст."
            )
        messages.append(
            AIMessageResponse(
                id=item.id,
                role=item.role,
                content=content,
                timestamp=item.timestamp,
            )
        )
    return AIHistoryResponse(session_id=latest_session_id, messages=messages)


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    body: AIChatRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> AIChatResponse:
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
        remaining_requests=None,
    )


@router.post("/analyze", response_model=AIAnalyzeResponse)
async def ai_analyze(
    body: AIAnalyzeRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> AIAnalyzeResponse:
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
        remaining_requests=None,
    )
