"""Telegram Bot webhook + setup helpers (/start welcome, Menu Button Open)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from loguru import logger
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.services.telegram_bot import (
    TelegramBotError,
    extract_start_command,
    get_webhook_info,
    resolve_mini_app_url,
    send_start_welcome,
    set_chat_menu_button,
    set_webhook,
)

router = APIRouter(prefix="/telegram", tags=["telegram"])


class SetupMenuRequest(BaseModel):
    mini_app_url: str | None = Field(
        default=None,
        description="HTTPS Mini App URL; defaults to MINI_APP_URL env",
    )
    text: str = Field(default="Open", max_length=16)


class SetupWebhookRequest(BaseModel):
    webhook_url: str = Field(
        ...,
        description="Public HTTPS URL ending with /telegram/webhook",
    )
    drop_pending: bool = False


def _verify_secret(
    settings: Settings,
    x_telegram_bot_api_secret_token: str | None,
) -> None:
    expected = (settings.telegram_webhook_secret or "").strip()
    if not expected:
        return
    if (x_telegram_bot_api_secret_token or "") != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="bad secret")


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Telegram update endpoint.

    Handles /start → welcome text + Open button.
    Always returns 200 so Telegram does not retry forever on user errors.
    """
    _verify_secret(settings, x_telegram_bot_api_secret_token)

    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    if not isinstance(update, dict):
        return {"ok": True}

    start = extract_start_command(update)
    if not start:
        return {"ok": True}

    chat_id = start["chat_id"]
    first_name = start.get("first_name")
    logger.info(
        "telegram_start chat_id={} user_id={} username={}",
        chat_id,
        start.get("user_id"),
        start.get("username"),
    )

    try:
        # Ensure this chat also gets the blue Open menu button
        mini = resolve_mini_app_url(settings)
        if mini:
            try:
                await set_chat_menu_button(
                    settings,
                    mini_app_url=mini,
                    text="Open",
                    chat_id=chat_id,
                )
            except TelegramBotError as exc:
                logger.warning("set_chat_menu_button_failed chat={} err={}", chat_id, exc)

        await send_start_welcome(
            settings,
            chat_id=chat_id,
            first_name=str(first_name) if first_name else None,
        )
    except TelegramBotError as exc:
        logger.error("telegram_start_reply_failed chat={} err={}", chat_id, exc)

    return {"ok": True}


@router.post("/setup/menu-button")
async def setup_menu_button(
    body: SetupMenuRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """
    Set default Menu Button (Open) for all chats.

    Dev/ops helper — call once after MINI_APP_URL / ngrok URL is known.
    Disabled in production unless explicitly allowed later.
    """
    if settings.environment == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Use scripts/setup_telegram_bot.ps1 or BotFather in production",
        )
    try:
        data = await set_chat_menu_button(
            settings,
            mini_app_url=body.mini_app_url,
            text=body.text or "Open",
            chat_id=None,
        )
        return {
            "ok": True,
            "menu_url": body.mini_app_url or resolve_mini_app_url(settings),
            "result": data.get("result"),
        }
    except TelegramBotError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/setup/webhook")
async def setup_webhook(
    body: SetupWebhookRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Register webhook URL (dev helper)."""
    if settings.environment == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Configure webhook via ops script in production",
        )
    try:
        data = await set_webhook(
            settings,
            webhook_url=body.webhook_url,
            drop_pending=body.drop_pending,
        )
        info = await get_webhook_info(settings)
        return {"ok": True, "set": data.get("result"), "info": info.get("result")}
    except TelegramBotError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/setup/webhook")
async def webhook_info(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    if settings.environment == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    try:
        info = await get_webhook_info(settings)
        return {"ok": True, "info": info.get("result")}
    except TelegramBotError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
