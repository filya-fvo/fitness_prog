"""Deliver OTP codes via Telegram and/or SMTP."""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from loguru import logger

from app.core.config import Settings
from app.services.telegram_bot import TelegramBotError, send_message


class EmailDeliveryError(RuntimeError):
    """Raised when no delivery channel could send the code."""


def smtp_configured(settings: Settings) -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


async def send_otp_telegram(
    settings: Settings,
    *,
    telegram_id: int,
    email: str,
    code: str,
    purpose: str,
) -> bool:
    """Send OTP to the user's Telegram chat. Returns True on success."""
    if purpose == "link":
        text = (
            f"🔐 Код подтверждения email <b>{email}</b>:\n"
            f"<code>{code}</code>\n\n"
            "Код действует 10 минут. Никому его не сообщайте."
        )
    else:
        text = (
            f"🔐 Код входа в Fitness:\n"
            f"<code>{code}</code>\n\n"
            f"Email: <b>{email}</b>\n"
            "Код действует 10 минут. Никому его не сообщайте."
        )
    try:
        await send_message(settings, chat_id=int(telegram_id), text=text)
        return True
    except TelegramBotError as exc:
        logger.warning("otp_telegram_failed telegram_id={} err={}", telegram_id, exc)
        return False


def send_otp_smtp(
    settings: Settings,
    *,
    email: str,
    code: str,
    purpose: str,
) -> bool:
    """Send OTP via SMTP. Returns True on success."""
    if not smtp_configured(settings):
        return False

    subject = "Код подтверждения email" if purpose == "link" else "Код входа в Fitness"
    body = (
        f"Ваш код: {code}\n\n"
        f"Email: {email}\n"
        "Код действует 10 минут.\n"
        "Если вы не запрашивали код — просто игнорируйте письмо."
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = email
    msg.set_content(body)

    try:
        if settings.smtp_tls:
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                smtp.starttls(context=context)
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 — surface as delivery failure
        logger.warning("otp_smtp_failed email={} err={}", email, exc)
        return False


async def deliver_otp(
    settings: Settings,
    *,
    email: str,
    code: str,
    purpose: str,
    telegram_id: int | None,
) -> list[str]:
    """
    Try delivery channels. Returns list of channels used: telegram|smtp|dev_log.
    Raises EmailDeliveryError if nothing worked.
    """
    channels: list[str] = []

    if telegram_id is not None:
        ok = await send_otp_telegram(
            settings,
            telegram_id=telegram_id,
            email=email,
            code=code,
            purpose=purpose,
        )
        if ok:
            channels.append("telegram")

    if send_otp_smtp(settings, email=email, code=code, purpose=purpose):
        channels.append("smtp")

    # Dev fallback: never block local testing when SMTP/Telegram unavailable
    if not channels and settings.environment in {"development", "debug", "test"}:
        logger.warning(
            "otp_dev_fallback purpose={} email={} code={}",
            purpose,
            email,
            code,
        )
        channels.append("dev_log")

    if not channels:
        raise EmailDeliveryError(
            "Не удалось отправить код. Настройте SMTP или откройте бота в Telegram."
        )
    return channels
