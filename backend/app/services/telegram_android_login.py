"""Strict private bot confirmation, invoked only after webhook secret validation."""

import re
from loguru import logger
from app.core.database import AsyncSessionLocal
from app.services.android_login import claim_login, approve_login
from app.services.telegram_bot import (
    TelegramBotError,
    send_message,
    answer_callback_query,
    edit_message_text,
)

TOKEN = r"[A-Za-z0-9_-]{43}"


def parse_login_update(update: dict):
    query = update.get("callback_query")
    callback = isinstance(query, dict)
    message = query.get("message") if callback else update.get("message")
    if not isinstance(message, dict):
        return None
    actor = query.get("from") if callback else message.get("from")
    chat = message.get("chat")
    if not isinstance(actor, dict) or not isinstance(chat, dict):
        return None
    actor_id = actor.get("id")
    if (
        type(actor_id) is not int
        or not 0 < actor_id < 2**63
        or chat.get("type") != "private"
        or chat.get("id") != actor_id
        or actor.get("is_bot")
    ):
        return None
    bounded = {"id": actor_id}
    for key, limit in [
        ("first_name", 128),
        ("last_name", 128),
        ("username", 32),
        ("language_code", 16),
    ]:
        value = actor.get(key)
        if value is not None and (not isinstance(value, str) or len(value) > limit):
            return None
        bounded[key] = value
    raw = query.get("data", "") if callback else message.get("text", "")
    if not isinstance(raw, str):
        return None
    pattern = (
        r"(al|tl):(" + TOKEN + r")"
        if callback
        else r"/start(?:@[A-Za-z0-9_]{5,32})? (android_login|telegram_link)_(" + TOKEN + r")"
    )
    found = re.fullmatch(pattern, raw)
    if not found:
        return None
    if callback and (
        not isinstance(query.get("id"), str)
        or len(query["id"]) > 128
        or type(message.get("message_id")) is not int
    ):
        return None
    return {
        "token": found[2],
        "purpose": "link" if found[1] in {"tl", "telegram_link"} else "login",
        "actor": bounded,
        "callback_id": query["id"] if callback else None,
        "message_id": message.get("message_id"),
    }


async def handle_login_update(settings, update) -> bool:
    parsed = parse_login_update(update)
    if parsed is None:
        return False
    actor_id = parsed["actor"]["id"]
    linking = parsed["purpose"] == "link"
    async with AsyncSessionLocal() as session:
        if parsed["callback_id"]:
            accepted = await approve_login(
                session, parsed["token"], actor_id, purpose=parsed["purpose"]
            )
            try:
                await answer_callback_query(
                    settings,
                    callback_query_id=parsed["callback_id"],
                    text=("Подключение подтверждено" if linking else "Вход подтверждён")
                    if accepted
                    else "Ссылка больше недоступна",
                )
                if accepted:
                    await edit_message_text(
                        settings,
                        chat_id=actor_id,
                        message_id=parsed["message_id"],
                        text=(
                            "Подключение Telegram подтверждено. Вернитесь в профиль FilFit и нажмите «Продолжить»."
                            if linking
                            else "Вход в FilFit подтверждён. Вернитесь в Android-приложение и нажмите «Продолжить»."
                        ),
                        reply_markup={"inline_keyboard": []},
                    )
            except TelegramBotError as error:
                logger.warning(
                    "native_login_bot_receipt_failed error_type={}", type(error).__name__
                )
        else:
            accepted = await claim_login(
                session, parsed["token"], parsed["actor"], purpose=parsed["purpose"]
            )
            if accepted:
                await send_message(
                    settings,
                    chat_id=actor_id,
                    text=(
                        "Подключить этот Telegram к вашему аккаунту FilFit?\nЕсли вы не начинали подключение в профиле, не нажимайте кнопку и никому не пересылайте ссылку."
                        if linking
                        else "Подтвердить вход в Android-приложение FilFit?\nЕсли вы не начинали вход, не нажимайте кнопку и никому не пересылайте эту ссылку."
                    ),
                    reply_markup={
                        "inline_keyboard": [
                            [
                                {
                                    "text": "Подключить Telegram"
                                    if linking
                                    else "Подтвердить вход",
                                    "callback_data": ("tl:" if linking else "al:")
                                    + parsed["token"],
                                }
                            ]
                        ]
                    },
                )
            else:
                await send_message(
                    settings,
                    chat_id=actor_id,
                    text="Эта ссылка больше недоступна. Начните подключение заново в профиле FilFit."
                    if linking
                    else "Эта ссылка входа уже недоступна. Начните вход заново в Android-приложении.",
                )
    return True
