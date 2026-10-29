"""Publication and owner-only next-open access; legacy broadcasts stay unchanged."""
import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.deps import user_is_admin
from app.models.release_notice import ReleaseNotice, ReleaseNoticeReceipt
from app.models.user import User
from app.schemas.release_notice import ReleaseNoticePublish
from app.services import admin_audit
from app.services.android_notification_delivery import android_delivery_state
from app.services.notification_prefs import in_quiet_hours, merge_notification_settings


def selected_channel(user: User) -> str | None:
    if user.is_deleted:
        return None
    goals = user.goals or {}
    if android_delivery_state(goals).enabled:
        return "android"
    return merge_notification_settings(goals.get("notification_settings"))["delivery_channel"]


def external_delivery_quiet(user: User, now: datetime) -> bool:
    prefs = merge_notification_settings((user.goals or {}).get("notification_settings"))
    return in_quiet_hours(prefs, now.astimezone(ZoneInfo(prefs["timezone"])))


def content_hash(payload: ReleaseNoticePublish) -> str:
    return hashlib.sha256(json.dumps(payload.model_dump(), sort_keys=True, ensure_ascii=False).encode()).hexdigest()


async def preview_audience(session: AsyncSession) -> dict[str, int]:
    counts: dict[str, int] = {}
    for user in await session.scalars(select(User).where(User.is_deleted.is_(False))):
        channel = selected_channel(user)
        counts[channel] = counts.get(channel, 0) + 1
    return counts


async def publish_notice(session: AsyncSession, payload: ReleaseNoticePublish, *, actor_id: UUID,
                         settings: Settings, now: datetime | None = None) -> ReleaseNotice:
    now = now or datetime.now(UTC)
    actor = await session.scalar(select(User).where(User.id == actor_id, User.is_deleted.is_(False)).execution_options(populate_existing=True))
    if actor is None or not user_is_admin(actor, settings):
        raise HTTPException(403, "Недостаточно прав")
    # A global transaction lock is intentionally small: only explicit publication,
    # never network delivery. It also protects alternative-key publication races.
    await session.execute(text("SELECT pg_advisory_xact_lock(7360842950029)"))
    existing = await session.scalar(select(ReleaseNotice).where(or_(
        ReleaseNotice.release_key == payload.release_key,
        ReleaseNotice.apk_version == payload.apk_version,
        ReleaseNotice.apk_sha256 == payload.apk_sha256,
    )))
    fingerprint = content_hash(payload)
    if existing is not None:
        if existing.content_hash != fingerprint:
            raise HTTPException(409, "Для этого выпуска уже существует другое уведомление")
        await session.commit()
        return existing
    notice = ReleaseNotice(id=uuid4(), actor_user_id=actor_id,
                           content_hash=fingerprint, created_at=now, **payload.model_dump())
    session.add(notice)
    # Account cohort is captured once. Replay never adds new accounts or resets receipts.
    users = list(await session.scalars(select(User).where(User.is_deleted.is_(False))))
    for user in users:
        channel = selected_channel(user)
        session.add(ReleaseNoticeReceipt(notice_id=notice.id, user_id=user.id, channel=channel,
            status="awaiting_open" if channel == "android" else "pending", next_attempt_at=now))
    admin_audit.add_event(session, context=admin_audit.AuditContext(actor_id, notice.id),
        action="release_notice.publish", object_type="release_notice", object_id=notice.id,
        result="success", description="Уведомление о проверенном выпуске поставлено в очередь.",
        after={"expected": len(users), "status": "published"}, notification_status="pending")
    await session.commit()
    return notice


async def notice_counts(session: AsyncSession, notice_id: UUID) -> dict[str, int]:
    return {str(status): int(count) for status, count in (await session.execute(
        select(ReleaseNoticeReceipt.status, func.count()).where(ReleaseNoticeReceipt.notice_id == notice_id)
        .group_by(ReleaseNoticeReceipt.status))).all()}


async def overlay_counts(session: AsyncSession, notice_id: UUID) -> dict[str, int]:
    seen, unread = (await session.execute(select(
        func.count().filter(ReleaseNoticeReceipt.seen_at.is_not(None)),
        func.count().filter(ReleaseNoticeReceipt.seen_at.is_(None)),
    ).where(ReleaseNoticeReceipt.notice_id == notice_id))).one()
    return {"overlay_seen": int(seen), "overlay_unread": int(unread)}


async def _active_owner(session: AsyncSession, user_id: UUID) -> bool:
    user = await session.scalar(select(User).where(User.id == user_id, User.is_deleted.is_(False))
        .with_for_update().execution_options(populate_existing=True))
    return user is not None


async def pending_notices(session: AsyncSession, user_id: UUID) -> list[ReleaseNotice]:
    if not await _active_owner(session, user_id):
        await session.commit()
        return []
    items = list(await session.scalars(select(ReleaseNotice).join(ReleaseNoticeReceipt)
        .where(ReleaseNoticeReceipt.user_id == user_id,
               ReleaseNoticeReceipt.seen_at.is_(None))
        .order_by(ReleaseNotice.created_at.desc()).limit(20)))
    # Reading never acknowledges a notice. A failed/offline ACK can be retried.
    await session.commit()
    return items


async def mark_seen(session: AsyncSession, user_id: UUID, notice_id: UUID) -> None:
    if not await _active_owner(session, user_id):
        raise HTTPException(404, "Уведомление не найдено")
    receipt = await session.scalar(select(ReleaseNoticeReceipt).where(
        ReleaseNoticeReceipt.notice_id == notice_id, ReleaseNoticeReceipt.user_id == user_id)
        .with_for_update())
    if receipt is None:
        raise HTTPException(404, "Уведомление не найдено")
    # Overlay acknowledgement is independent of external delivery. The worker
    # may still need to send the selected Telegram/browser announcement.
    receipt.seen_at = receipt.seen_at or datetime.now(UTC)
    await session.commit()
