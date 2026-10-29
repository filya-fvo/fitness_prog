"""Bounded claim-before-send delivery using existing Telegram and Web Push."""
import asyncio
import html
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.models.release_notice import ReleaseNotice, ReleaseNoticeReceipt
from app.models.supplement_intake import WebPushSubscription
from app.models.user import User
from app.services.admin_broadcast_delivery import classify_telegram_error
from app.services.release_notices import external_delivery_quiet, selected_channel
from app.services.telegram_bot import TelegramBotError, send_app_notification
from app.services.web_push import send_user_web_push, web_push_configured


async def send_external(session: AsyncSession, settings: Settings, user: User,
                        notice: ReleaseNotice, channel: str) -> tuple[str, str | None]:
    try:
        if channel == "telegram":
            if user.telegram_id is None:
                return "unavailable", "telegram_unavailable"
            await send_app_notification(settings, telegram_id=int(user.telegram_id),
                title=html.escape(notice.title),
                text=html.escape(notice.message_text) + "\n\nСкачать APK: " + html.escape(notice.apk_url),
                startapp="home", timeout=10.0)
            return "sent", None
        expected = await session.scalar(select(func.count()).select_from(WebPushSubscription).where(
            WebPushSubscription.user_id == user.id, WebPushSubscription.disabled_at.is_(None),
            WebPushSubscription.is_deleted.is_(False)))
        if not expected:
            return "unavailable", "browser_unavailable"
        if not web_push_configured(settings.web_push_vapid_public_key, settings.web_push_vapid_private_key,
                                   settings.web_push_vapid_subject):
            return "unavailable", "browser_not_configured"
        sent = await send_user_web_push(session, settings, user_id=user.id, title=notice.title,
            body=notice.message_text, url="/", tag=f"release-{notice.id}", commit=False, timeout=10.0)
        if sent == expected:
            return "sent", None
        if sent > 0:
            return "partial", "browser_partial"
        return "unknown", "browser_unconfirmed"
    except TelegramBotError as exc:
        state, error = classify_telegram_error(exc)
        if state == "skipped":
            return "unavailable", error
        return "unknown", error
    except Exception:
        # No raw transport errors, tokens, endpoints or recipient identifiers in logs.
        # The remote side may have accepted a message before the local failure.
        return "unknown", "transport_uncertain"


def _defer_or_skip(receipt: ReleaseNoticeReceipt, user: User | None, now: datetime) -> bool:
    channel = selected_channel(user) if user is not None else None
    if channel is None:
        receipt.status, receipt.error_code = "skipped", "user_unavailable"
        return True
    receipt.channel = channel
    if channel == "android":
        receipt.status = "seen" if receipt.seen_at is not None else "awaiting_open"
        receipt.next_attempt_at = now + timedelta(minutes=5)
        return True
    if external_delivery_quiet(user, now):
        receipt.status = "pending"
        receipt.next_attempt_at = now + timedelta(minutes=1)
        return True
    return False


async def _lock_user_receipt(session: AsyncSession, notice_id: UUID, user_id: UUID, *, skip_locked: bool = True):
    # Match notification preference/ACK lock order: User, then receipt. SKIP LOCKED
    # allows independent cron workers without holding a global network lock.
    user = await session.scalar(select(User).where(User.id == user_id)
        .with_for_update(skip_locked=skip_locked).execution_options(populate_existing=True))
    if user is None:
        return None, None
    receipt = await session.scalar(select(ReleaseNoticeReceipt).where(
        ReleaseNoticeReceipt.notice_id == notice_id, ReleaseNoticeReceipt.user_id == user_id)
        .with_for_update(skip_locked=skip_locked).execution_options(populate_existing=True))
    return user, receipt


def _delivery_clock(now: datetime | None, clock: Callable[[], datetime] | None) -> Callable[[], datetime]:
    if clock is not None:
        return clock
    if now is not None:
        return lambda: now  # Existing deterministic test injection, never used by cron.
    return lambda: datetime.now(UTC)


async def _deliver_one(factory: async_sessionmaker, settings: Settings, notice_id: UUID,
                       user_id: UUID, now: datetime | None = None, *,
                       clock: Callable[[], datetime] | None = None) -> None:
    read_clock = _delivery_clock(now, clock)
    async with factory() as session:
        user, receipt = await _lock_user_receipt(session, notice_id, user_id)
        checked_at = read_clock()
        if receipt is None or receipt.status not in {"pending", "awaiting_open"} or receipt.next_attempt_at > checked_at:
            return
        if _defer_or_skip(receipt, user, checked_at):
            await session.commit()
            return
        receipt.status = "sending"
        receipt.attempted_at = checked_at
        await session.commit()  # Durable BEFORE external request; never replay sending.
    async with factory() as session:
        user, receipt = await _lock_user_receipt(session, notice_id, user_id, skip_locked=False)
        if receipt is None or receipt.status != "sending":
            return
        notice = await session.get(ReleaseNotice, notice_id)
        # Network/row-lock waits may have crossed a quiet-hours boundary. Refresh
        # after all database waits and immediately before this recipient transport.
        if _defer_or_skip(receipt, user, read_clock()):
            receipt.attempted_at = None  # No external call occurred.
            await session.commit()
            return
        receipt.status, receipt.error_code = await send_external(session, settings, user, notice, receipt.channel)
        if receipt.status in {"sent", "partial"}:
            receipt.delivered_at = read_clock()
        await session.commit()


async def deliver_pending(factory: async_sessionmaker, settings: Settings, *,
                          now: datetime | None = None, batch_size: int = 20,
                          clock: Callable[[], datetime] | None = None) -> dict[str, int]:
    read_clock = _delivery_clock(now, clock)
    now = read_clock()
    async with factory() as session:
        # A job can run for up to 900s. Older claims represent an interrupted request,
        # not a safe retry. A successful late sender cannot race this recovery because
        # its receipt/user locks cause SKIP LOCKED to exclude it.
        stale = list(await session.scalars(select(ReleaseNoticeReceipt).where(
            ReleaseNoticeReceipt.status == "sending", ReleaseNoticeReceipt.attempted_at < now - timedelta(minutes=16))
            .with_for_update(skip_locked=True)))
        for receipt in stale:
            receipt.status, receipt.error_code = "unknown", "worker_interrupted"
        await session.commit()
        candidates = (await session.execute(select(ReleaseNoticeReceipt.notice_id, ReleaseNoticeReceipt.user_id)
            .where(ReleaseNoticeReceipt.status.in_(["pending", "awaiting_open"]),
                   ReleaseNoticeReceipt.next_attempt_at <= now)
            .order_by(ReleaseNoticeReceipt.next_attempt_at, ReleaseNoticeReceipt.notice_id, ReleaseNoticeReceipt.user_id)
            .limit(min(100, max(1, batch_size))))).all()
    for index, (notice_id, user_id) in enumerate(candidates):
        await _deliver_one(factory, settings, notice_id, user_id, clock=read_clock)
        if index + 1 < len(candidates):
            await asyncio.sleep(0.06)  # Respect existing Telegram broadcast rate.
    return {"processed": len(candidates), "uncertain_recovered": len(stale)}
