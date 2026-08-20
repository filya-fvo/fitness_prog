"""Authenticated feedback delivery for Telegram and browser clients."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import Settings, get_settings
from app.deps import get_current_user
from app.models.user import User
from app.services.email_service import send_feedback_email

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackTargetResponse(BaseModel):
    admin_username: str
    note: str = "Legacy Telegram target; new clients submit feedback to the API."


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    message: str = Field(min_length=3, max_length=3500)
    page: str = Field(default="", max_length=300)
    client: str = Field(default="browser", max_length=40)
    app_version: str = Field(default="", max_length=80)
    user_agent: str = Field(default="", max_length=500)


class FeedbackCreateResponse(BaseModel):
    accepted: bool
    delivery: str


_feedback_memory_buckets: dict[str, tuple[int, int]] = {}


async def _consume_feedback_quota(user_id: str, settings: Settings) -> None:
    """Bound spam per authenticated user; Redis is preferred across workers."""
    limit = max(1, int(settings.feedback_hourly_limit))
    hour = int(time.time() // 3600)
    key = f"feedback:quota:{user_id}:{hour}"
    count: int
    try:
        import redis.asyncio as redis  # type: ignore

        client = redis.from_url(settings.redis_url, decode_responses=True)
        try:
            count = int(await client.incr(key))
            if count == 1:
                await client.expire(key, 7200)
        finally:
            await client.aclose()
    except Exception as exc:
        logger.warning("feedback_rate_limit_redis_unavailable err_type={}", type(exc).__name__)
        bucket_hour, previous = _feedback_memory_buckets.get(user_id, (hour, 0))
        count = previous + 1 if bucket_hour == hour else 1
        _feedback_memory_buckets[user_id] = (hour, count)
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много сообщений. Попробуйте отправить позже.",
        )


@router.get("/target", response_model=FeedbackTargetResponse)
async def feedback_target(
    settings: Settings = Depends(get_settings),
) -> FeedbackTargetResponse:
    """Keep the legacy target endpoint for already deployed clients."""
    names = sorted(settings.admin_username_set)
    username = names[0] if names else "Filatov_Slava"
    return FeedbackTargetResponse(admin_username=username)


@router.post("", response_model=FeedbackCreateResponse, status_code=status.HTTP_202_ACCEPTED)
async def submit_feedback(
    body: FeedbackCreate,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> FeedbackCreateResponse:
    await _consume_feedback_quota(str(user.id), settings)
    recipient = settings.admin_feedback_email.strip() or settings.smtp_from_email.strip()
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Канал обратной связи временно не настроен",
        )
    user_label = (
        f"id={user.id}; telegram_id={user.telegram_id or '-'}; "
        f"username={user.username or '-'}; email={user.auth_email or '-'}"
    )
    try:
        delivered = await send_feedback_email(
            settings=settings,
            to_email=recipient,
            message=body.message,
            user_label=user_label,
            context={
                "Клиент": body.client,
                "Страница": body.page,
                "Версия": body.app_version,
                "User-Agent": body.user_agent,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Не удалось отправить сообщение. Попробуйте позже.",
        ) from exc
    if not delivered:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Почтовая отправка временно не настроена",
        )
    return FeedbackCreateResponse(accepted=True, delivery="email")
