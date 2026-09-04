"""Telegram Bot webhook and setup helpers."""

from __future__ import annotations

import hmac
import json
from datetime import date as date_cls
from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from loguru import logger
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.services import notification_prefs, supplement_intakes
from app.services.telegram_bot import (
    TelegramBotError,
    answer_callback_query,
    edit_message_text,
    extract_admin_command,
    extract_callback_query,
    extract_help_command,
    extract_open_text_tap,
    extract_start_command,
    extract_web_app_data,
    get_webhook_info,
    resolve_mini_app_url,
    send_admin_guide,
    send_open_again,
    send_start_welcome,
    send_user_guide,
    set_bot_commands,
    set_default_chat_menu_button,
    set_webhook,
    supplement_intake_keyboard,
    water_intake_keyboard,
)
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

router = APIRouter(prefix="/telegram", tags=["telegram"])

# Persist which Telegram users already received the full guide on first /start.
_GUIDE_SENT_PATH = Path(__file__).resolve().parents[2] / "data" / "bot_guide_sent.json"


class SetupMenuRequest(BaseModel):
    """Deprecated request body retained for local API compatibility."""

    mini_app_url: str | None = None
    text: str | None = Field(default=None, max_length=16)


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
        if settings.environment == "production":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Секретный ключ webhook Telegram не настроен",
            )
        return
    if not hmac.compare_digest(x_telegram_bot_api_secret_token or "", expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Неверный секретный ключ")


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


async def _ensure_default_menu_button(settings: Settings, chat_id: int) -> None:
    try:
        await set_default_chat_menu_button(settings, chat_id=chat_id)
    except TelegramBotError as exc:
        logger.warning("set_default_menu_button_failed chat={} err={}", chat_id, exc)


async def _ensure_bot_commands(settings: Settings) -> None:
    """Register /start and /help in Telegram slash menu (best-effort)."""
    try:
        await set_bot_commands(settings)
    except TelegramBotError as exc:
        logger.warning("set_bot_commands_failed err={}", exc)


async def _send_help_response(settings: Settings, command: dict[str, Any]) -> None:
    chat_id = int(command["chat_id"])
    try:
        await send_user_guide(settings, chat_id=chat_id, with_open_button=True)
        _mark_guide_sent(command.get("user_id"), chat_id)
    except TelegramBotError as exc:
        logger.error("telegram_help_reply_failed chat={} err={}", chat_id, exc)


async def _send_start_response(
    settings: Settings,
    command: dict[str, Any],
    *,
    first_time: bool,
) -> None:
    chat_id = int(command["chat_id"])
    user_id = command.get("user_id")
    try:
        await send_start_welcome(
            settings,
            chat_id=chat_id,
            first_name=str(command.get("first_name")) if command.get("first_name") else None,
            send_full_guide=first_time,
        )
        if first_time:
            _mark_guide_sent(user_id if isinstance(user_id, int) else None, chat_id)
    except TelegramBotError as exc:
        logger.error("telegram_start_reply_failed chat={} err={}", chat_id, exc)


def _telegram_actor_is_admin(settings: Settings, command: dict[str, Any]) -> bool:
    """Authorize the hidden command using Telegram's signed webhook identity."""
    user_id = command.get("user_id")
    chat_id = command.get("chat_id")
    if not isinstance(user_id, int) or chat_id != user_id:
        return False
    if user_id in settings.admin_telegram_id_set:
        return True
    username = str(command.get("username") or "").strip().lstrip("@").lower()
    return bool(username and username in settings.admin_username_set)


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Telegram update endpoint.

    - /start → short welcome (name from Telegram) + Open button
      On first /start also sends the full guide as a downloadable file
    - /help → full user guide as a Markdown file (open/save in Telegram)
    - /admin → unlisted admin runbook, only for configured Telegram admins
    Always returns 200 so Telegram does not retry forever on user errors.
    """
    _verify_secret(settings, x_telegram_bot_api_secret_token)

    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    if not isinstance(update, dict):
        return {"ok": True}

    callback = extract_callback_query(update)
    if callback and callback["data"].startswith("si:"):
        background_tasks.add_task(
            _process_callback,
            settings,
            callback,
            _handle_supplement_callback,
        )
        return {"ok": True}
    if callback and callback["data"].startswith("wa:"):
        background_tasks.add_task(
            _process_callback,
            settings,
            callback,
            _handle_water_callback,
        )
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
            await _ensure_default_menu_button(settings, chat_id)
            await send_open_again(settings, chat_id=chat_id, reason="web_app_data")
        except TelegramBotError as exc:
            logger.error("telegram_web_app_data_reply_failed chat={} err={}", chat_id, exc)
        return {"ok": True}

    open_tap = extract_open_text_tap(update)
    if open_tap:
        chat_id = open_tap["chat_id"]
        logger.info("telegram_open_text chat_id={} user_id={}", chat_id, open_tap.get("user_id"))
        try:
            await _ensure_default_menu_button(settings, chat_id)
            await send_open_again(settings, chat_id=chat_id, reason="open_text")
        except TelegramBotError as exc:
            logger.error("telegram_open_text_reply_failed chat={} err={}", chat_id, exc)
        return {"ok": True}

    admin_cmd = extract_admin_command(update)
    if admin_cmd:
        if not _telegram_actor_is_admin(settings, admin_cmd):
            logger.warning(
                "telegram_admin_denied chat_id={} user_id={} username={}",
                admin_cmd.get("chat_id"),
                admin_cmd.get("user_id"),
                admin_cmd.get("username"),
            )
            return {"ok": True}
        logger.info(
            "telegram_admin_guide chat_id={} user_id={}",
            admin_cmd["chat_id"],
            admin_cmd.get("user_id"),
        )
        try:
            await send_admin_guide(settings, chat_id=admin_cmd["chat_id"])
        except TelegramBotError as exc:
            logger.error(
                "telegram_admin_guide_failed chat={} err={}",
                admin_cmd["chat_id"],
                exc,
            )
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
        background_tasks.add_task(_send_help_response, settings, help_cmd)
        return {"ok": True}

    start = extract_start_command(update)
    if not start:
        return {"ok": True}

    chat_id = start["chat_id"]
    user_id = start.get("user_id")
    first_time = _is_first_start(user_id if isinstance(user_id, int) else None, chat_id)
    logger.info(
        "telegram_start chat_id={} user_id={} username={} first_time={}",
        chat_id,
        user_id,
        start.get("username"),
        first_time,
    )

    background_tasks.add_task(_send_start_response, settings, start, first_time=first_time)

    return {"ok": True}


async def _process_callback(
    settings: Settings,
    callback: dict[str, Any],
    handler: Callable[[Settings, dict[str, Any]], Awaitable[None]],
) -> None:
    """Acknowledge quickly and never let a stale callback poison the webhook queue."""
    try:
        await answer_callback_query(
            settings,
            callback_query_id=callback["id"],
            text="Сохраняю…",
        )
    except TelegramBotError as exc:
        logger.warning("telegram_callback_ack_failed kind={} err={}", callback["data"][:2], exc)
    try:
        await handler(settings, callback)
    except Exception as exc:  # noqa: BLE001 - retries must not replay a user action
        logger.exception("telegram_callback_failed kind={} err={}", callback["data"][:2], exc)


async def _handle_supplement_callback(settings: Settings, callback: dict[str, Any]) -> None:
    parts = callback["data"].split(":", 2)
    if len(parts) != 3:
        logger.warning("telegram_supplement_callback_invalid")
        return
    action, raw_id = parts[1], parts[2]
    try:
        import uuid

        intake_id = uuid.UUID(raw_id)
    except ValueError:
        logger.warning("telegram_supplement_callback_invalid_id")
        return

    async with AsyncSessionLocal() as session:
        user = await session.scalar(
            select(User).where(
                User.telegram_id == callback["user_id"],
                User.is_deleted.is_(False),
            )
        )
        if user is None:
            logger.warning("telegram_supplement_callback_user_missing")
            return
        if action == "a":
            rows = await supplement_intakes.mark_group(
                session, user, intake_id, status="taken", source="telegram"
            )
        elif action in {"t", "s"}:
            row = await supplement_intakes.mark_intake(
                session,
                user,
                intake_id,
                status="taken" if action == "t" else "skipped",
                source="telegram",
            )
            rows = [row] if row is not None else []
        elif action == "z":
            rows = await supplement_intakes.snooze_group(session, user, intake_id, minutes=30)
        else:
            rows = []
    if not rows:
        return
    async with AsyncSessionLocal() as session:
        user = await session.scalar(
            select(User).where(User.telegram_id == callback["user_id"], User.is_deleted.is_(False))
        )
        current = (
            await supplement_intakes.intake_group(session, user, intake_id) if user is not None else []
        )
    icons = {"taken": "✅", "skipped": "⏭", "pending": "⏳"}
    lines = [
        f"{icons.get(row.status, '•')} <b>{row.name_ru}</b>"
        + (f" — {row.dose}" if row.dose else "")
        for row in current
    ]
    pending = [(str(row.id), row.name_ru) for row in current if row.status == "pending"]
    try:
        message_text = "💊 <b>Добавки</b>\n" + "\n".join(lines)
        keyboard = supplement_intake_keyboard(pending) if pending else {"inline_keyboard": []}
        if action == "z":
            message_text += "\n\n⏰ Напоминание перенесено на 30 минут."
            keyboard = {"inline_keyboard": []}
        await edit_message_text(
            settings,
            chat_id=callback["chat_id"],
            message_id=callback["message_id"],
            text=message_text,
            reply_markup=keyboard,
        )
    except TelegramBotError as exc:
        logger.warning("supplement_callback_edit_failed err={}", exc)


async def _handle_water_callback(settings: Settings, callback: dict[str, Any]) -> None:
    parts = callback["data"].split(":", 2)
    try:
        amount = int(parts[1])
    except (IndexError, TypeError, ValueError):
        amount = 0
    if amount not in {250, 500}:
        logger.warning("telegram_water_callback_invalid_amount")
        return

    async with AsyncSessionLocal() as session:
        user = await session.scalar(
            select(User)
            .where(
                User.telegram_id == callback["user_id"],
                User.is_deleted.is_(False),
            )
            .with_for_update()
        )
        if user is None:
            logger.warning("telegram_water_callback_user_missing")
            return

        goals = dict(user.goals or {})
        reminder_settings = notification_prefs.merge_notification_settings(
            goals.get("notification_settings")
            if isinstance(goals.get("notification_settings"), dict)
            else None
        )
        local_today = notification_prefs.local_now(
            str(reminder_settings.get("timezone") or notification_prefs.DEFAULT_TZ)
        ).date()
        water_day = local_today
        if len(parts) == 3:
            try:
                water_day = date_cls.fromisoformat(parts[2])
            except ValueError:
                logger.warning("telegram_water_callback_invalid_date")
                return
        updated_goals, total, applied = notification_prefs.add_water_from_telegram_callback(
            goals,
            water_day,
            amount,
            callback["id"],
        )
        user.goals = updated_goals
        flag_modified(user, "goals")
        await session.commit()

    if not applied:
        logger.info("telegram_water_callback_duplicate")

    water_settings = reminder_settings.get("water") or {}
    try:
        target = max(500, min(8000, int(water_settings.get("daily_ml") or 2500)))
    except (TypeError, ValueError):
        target = 2500
    day_label = "Сегодня" if water_day == local_today else f"За {water_day:%d.%m}"
    try:
        await edit_message_text(
            settings,
            chat_id=callback["chat_id"],
            message_id=callback["message_id"],
            text=(
                "💧 <b>Вода отмечена</b>\n"
                f"{day_label}: <b>{total} мл</b> из {target} мл."
            ),
            reply_markup=water_intake_keyboard(
                bot_username=settings.bot_username,
                mini_app_url=resolve_mini_app_url(settings),
                amount_ml=amount,
                date=water_day.isoformat(),
            ),
        )
    except TelegramBotError as exc:
        logger.warning("water_callback_edit_failed err={}", exc)


@router.post("/setup/menu-button")
async def setup_menu_button(
    body: SetupMenuRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """
    Restore Telegram's standard menu instead of a persistent Web App button.

    Dev/ops helper — call once after the permanent MINI_APP_URL is known.
    Disabled in production unless explicitly allowed later.
    """
    _ = body
    if settings.environment == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Настройте Telegram-бота через служебный скрипт или BotFather",
        )
    try:
        data = await set_default_chat_menu_button(settings, chat_id=None)
        return {
            "ok": True,
            "menu_type": "default",
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
            detail="Настройте webhook через служебный скрипт",
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Не найдено")
    try:
        info = await get_webhook_info(settings)
        return {"ok": True, "info": info.get("result")}
    except TelegramBotError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
