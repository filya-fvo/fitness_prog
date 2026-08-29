"""SMTP send helpers for email OTP login."""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from loguru import logger

from app.core.config import Settings


def _build_otp_message(
    *,
    settings: Settings,
    to_email: str,
    code: str,
) -> EmailMessage:
    ttl = max(1, int(settings.email_otp_ttl_minutes))
    msg = EmailMessage()
    msg["Subject"] = f"Код входа: {code}"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    msg.set_content(
        "Здравствуйте!\n\n"
        f"Ваш код для входа в Fil Fit: {code}\n\n"
        f"Код действует {ttl} мин. Если вы не запрашивали вход — просто игнорируйте письмо.\n"
    )
    msg.add_alternative(
        f"""\
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5;">
    <p>Здравствуйте!</p>
    <p>Ваш код для входа в <strong>Fil Fit</strong>:</p>
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">{code}</p>
    <p style="color:#666;">Код действует {ttl} мин. Если вы не запрашивали вход — просто игнорируйте письмо.</p>
  </body>
</html>
""",
        subtype="html",
    )
    return msg


def _build_feedback_message(
    *,
    settings: Settings,
    to_email: str,
    message: str,
    user_label: str,
    context: dict[str, str],
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Обратная связь из Fitness Mini App"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    context_lines = "\n".join(f"{key}: {value}" for key, value in context.items() if value)
    msg.set_content(
        "Новая обратная связь из Fitness Mini App\n\n"
        f"Пользователь: {user_label}\n"
        f"{context_lines}\n\n"
        "Сообщение:\n"
        f"{message}\n"
    )
    return msg


def _build_service_message(
    *,
    settings: Settings,
    to_email: str,
    message: str,
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Сообщение от поддержки Fil Fit"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    msg.set_content(
        "Здравствуйте!\n\n"
        "Сообщение от поддержки Fil Fit:\n\n"
        f"{message}\n\n"
        "Управлять согласием на такие письма можно в настройках уведомлений.\n"
    )
    return msg


def _send_smtp_sync(settings: Settings, msg: EmailMessage) -> None:
    host = settings.smtp_host
    port = int(settings.smtp_port)
    user = settings.smtp_username or settings.smtp_from_email
    password = settings.smtp_password
    if not password:
        raise RuntimeError("SMTP_PASSWORD is not configured")

    if settings.smtp_use_ssl or port == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(user, password)
        smtp.send_message(msg)


async def send_login_otp_email(
    *,
    settings: Settings,
    to_email: str,
    code: str,
) -> bool:
    """Send OTP email. Returns True if SMTP send succeeded."""
    if not settings.smtp_password:
        logger.warning(
            "smtp_not_configured email={} — OTP not emailed (dev log only)",
            to_email,
        )
        return False

    msg = _build_otp_message(settings=settings, to_email=to_email, code=code)
    try:
        await asyncio.to_thread(_send_smtp_sync, settings, msg)
        logger.info("email_otp_sent to={}", to_email)
        return True
    except Exception:
        logger.exception("email_otp_send_failed to={}", to_email)
        raise


async def send_feedback_email(
    *,
    settings: Settings,
    to_email: str,
    message: str,
    user_label: str,
    context: dict[str, str],
) -> bool:
    """Deliver authenticated user feedback without exposing the admin address."""
    if not settings.smtp_password or not to_email:
        logger.warning("feedback_smtp_not_configured")
        return False
    email = _build_feedback_message(
        settings=settings,
        to_email=to_email,
        message=message,
        user_label=user_label,
        context=context,
    )
    try:
        await asyncio.to_thread(_send_smtp_sync, settings, email)
        logger.info("feedback_email_sent")
        return True
    except Exception:
        logger.exception("feedback_email_send_failed")
        raise


async def send_service_email(
    *,
    settings: Settings,
    to_email: str,
    message: str,
) -> bool:
    """Deliver one admin service message after verified user opt-in."""
    if not settings.smtp_password or not to_email:
        logger.warning("service_message_smtp_not_configured")
        return False
    email = _build_service_message(
        settings=settings,
        to_email=to_email,
        message=message,
    )
    try:
        await asyncio.to_thread(_send_smtp_sync, settings, email)
        logger.info("service_message_email_sent")
        return True
    except Exception as exc:
        logger.warning(
            "service_message_email_failed error_type={}",
            type(exc).__name__,
        )
        return False
