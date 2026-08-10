"""Telegram Bot webhook + setup helpers (/start welcome, Menu Button Open)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from loguru import logger
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.services.telegram_bot import (
    TelegramBotError,
    extract_help_command,
    extract_open_text_tap,
    extract_start_command,
    extract_web_app_data,
    get_webhook_info,
    resolve_mini_app_url,
    send_open_again,
    send_start_welcome,
    send_user_guide,
    set_bot_commands,
    set_chat_menu_button,
    set_webhook,
)

router = APIRouter(prefix="/telegram", tags=["telegram"])

# Persist which Telegram users already received the full guide on first /start.
_GUIDE_SENT_PATH = Path(__file__).resolve().parents[2] / "data" / "bot_guide_sent.json"


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


def _load_guide_sent() -> dict[str, Any]:
    try:
        if _GUIDE_SENT_PATH.is_file():
            raw = json.loads(_GUIDE_SENT_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return raw
    except Exception as exc:  # noqa: BLE001 — soft fail local store
        logger.warning("guide_sent_load_failed err={}", exc)
    return {}


def _save_guide_sent(data: dict[str, Any]) -> None:
    try:
        _GUIDE_SENT_PATH.parent.mkdir(parents=True, exist_ok=True)
        _GUIDE_SENT_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("guide_sent_save_failed err={}", exc)


def _is_first_start(telegram_user_id: int | None, chat_id: int) -> bool:
    """True if this Telegram identity has not received the full guide yet."""
    key = str(telegram_user_id if telegram_user_id is not None else chat_id)
    store = _load_guide_sent()
    return key not in store


def _mark_guide_sent(telegram_user_id: int | None, chat_id: int) -> None:
    from datetime import datetime, timezone

    key = str(telegram_user_id if telegram_user_id is not None else chat_id)
    store = _load_guide_sent()
    store[key] = {
        "chat_id": chat_id,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_guide_sent(store)


async def _ensure_menu_button(settings: Settings, chat_id: int) -> None:
    mini = resolve_mini_app_url(settings)
    if not mini:
        return
    try:
        await set_chat_menu_button(
            settings,
            mini_app_url=mini,
            text="Open",
            chat_id=chat_id,
        )
    except TelegramBotError as exc:
        logger.warning("set_chat_menu_button_failed chat={} err={}", chat_id, exc)


async def _ensure_bot_commands(settings: Settings) -> None:
    """Register /start and /help in Telegram slash menu (best-effort)."""
    try:
        await set_bot_commands(settings)
    except TelegramBotError as exc:
        logger.warning("set_bot_commands_failed err={}", exc)


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Telegram update endpoint.

    - /start → short welcome (name from Telegram) + Open button
      On first /start also sends the full guide as a downloadable file
    - /help → full user guide as a Markdown file (open/save in Telegram)
    Always returns 200 so Telegram does not retry forever on user errors.
    """
    _verify_secret(settings, x_telegram_bot_api_secret_token)

    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    if not isinstance(update, dict):
        return {"ok": True}

    # Legacy Mini App sendData closes the app and delivers web_app_data here.
    wad = extract_web_app_data(update)
    if wad:
        chat_id = wad["chat_id"]
        logger.info(
            "telegram_web_app_data chat_id={} user_id={} data_len={}",
            chat_id,
            wad.get("user_id"),
            len(str(wad.get("data") or "")),
        )
        try:
            await _ensure_menu_button(settings, chat_id)
            await send_open_again(settings, chat_id=chat_id, reason="web_app_data")
        except TelegramBotError as exc:
            logger.error("telegram_web_app_data_reply_failed chat={} err={}", chat_id, exc)
        return {"ok": True}

    open_tap = extract_open_text_tap(update)
    if open_tap:
        chat_id = open_tap["chat_id"]
        logger.info("telegram_open_text chat_id={} user_id={}", chat_id, open_tap.get("user_id"))
        try:
            await _ensure_menu_button(settings, chat_id)
            await send_open_again(settings, chat_id=chat_id, reason="open_text")
        except TelegramBotError as exc:
            logger.error("telegram_open_text_reply_failed chat={} err={}", chat_id, exc)
        return {"ok": True}

    help_cmd = extract_help_command(update)
    if help_cmd:
        chat_id = help_cmd["chat_id"]
        logger.info(
            "telegram_help chat_id={} user_id={} username={}",
            chat_id,
            help_cmd.get("user_id"),
            help_cmd.get("username"),
        )
        try:
            await _ensure_menu_button(settings, chat_id)
            await _ensure_bot_commands(settings)
            await send_user_guide(settings, chat_id=chat_id, with_open_button=True)
            _mark_guide_sent(help_cmd.get("user_id"), chat_id)
        except TelegramBotError as exc:
            logger.error("telegram_help_reply_failed chat={} err={}", chat_id, exc)
        return {"ok": True}

    start = extract_start_command(update)
    if not start:
        return {"ok": True}

    chat_id = start["chat_id"]
    first_name = start.get("first_name")
    user_id = start.get("user_id")
    first_time = _is_first_start(user_id if isinstance(user_id, int) else None, chat_id)
    logger.info(
        "telegram_start chat_id={} user_id={} username={} first_time={}",
        chat_id,
        user_id,
        start.get("username"),
        first_time,
    )

    try:
        await _ensure_bot_commands(settings)
        await _ensure_menu_button(settings, chat_id)
        await send_start_welcome(
            settings,
            chat_id=chat_id,
            first_name=str(first_name) if first_name else None,
            send_full_guide=first_time,
        )
        if first_time:
            _mark_guide_sent(user_id if isinstance(user_id, int) else None, chat_id)
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