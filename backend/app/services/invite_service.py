"""Referral invite lifecycle with hashed credentials and explicit consent."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, urlencode

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.invite import Invite, InviteLookupAttempt, InviteRedemption, ReferralAttribution
from app.models.user import User
from app.services import social_service

INVITE_TTL_DAYS = 14
INVITE_MAX_USES = 20
INVITE_DAILY_CREATE_LIMIT = 10
INVITE_CODE_ATTEMPTS_PER_HOUR = 30
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class InviteError(RuntimeError):
    pass


class InviteNotFoundError(InviteError):
    pass


class InviteExpiredError(InviteError):
    pass


class InviteUnavailableError(InviteError):
    pass


class InviteSelfAcceptError(InviteError):
    pass


class InviteRateLimitError(InviteError):
    pass


class InviteLookupRateLimitError(InviteError):
    pass


@dataclass(slots=True)
class CreatedInvite:
    invite: Invite
    token: str
    code: str
    web_url: str
    telegram_url: str | None


@dataclass(slots=True)
class InvitePreview:
    invite: Invite
    inviter_label: str
    already_accepted: bool
    mode: str


@dataclass(slots=True)
class AcceptedInvite:
    inviter_label: str
    already_accepted: bool
    mode: str
    friendship_id: uuid.UUID | None = None
    competition_id: uuid.UUID | None = None


def normalize_invite_code(value: str) -> str:
    return "".join(char for char in value.upper() if char.isalnum())


def hash_invite_credential(value: str, settings: Settings, *, kind: str) -> str:
    normalized = normalize_invite_code(value) if kind == "code" else value.strip()
    return hmac.new(
        settings.jwt_secret.encode("utf-8"),
        f"invite-{kind}:{normalized}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def inviter_label(user: User) -> str:
    username = (user.username or "").strip().lstrip("@")
    return f"@{username}" if username else "Пользователь Fitness Trainer"


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _invite_mode(invite: Invite, user: User) -> str:
    """A social link is an offer only to an account that pre-dates the link."""
    if invite.purpose != "referral_social" or user.created_at is None:
        return "referral"
    return "social" if _as_utc(user.created_at) <= _as_utc(invite.created_at) else "referral"


def build_invite_links(token: str, settings: Settings) -> tuple[str, str | None]:
    base = settings.mini_app_url.strip().rstrip("/")
    if not base:
        raise InviteUnavailableError("public application URL is not configured")
    web_url = f"{base}/invite?{urlencode({'token': token})}"
    bot = settings.bot_username.strip().lstrip("@")
    telegram_url = f"https://t.me/{quote(bot)}?startapp=i_{token}" if bot else None
    return web_url, telegram_url


def _credential_hashes(value: str, settings: Settings) -> tuple[str, str]:
    raw = value.strip()
    return (
        hash_invite_credential(raw, settings, kind="token"),
        hash_invite_credential(raw, settings, kind="code"),
    )


def _is_short_code(value: str) -> bool:
    normalized = normalize_invite_code(value)
    return len(normalized) == 8 and all(char in CODE_ALPHABET for char in normalized)


async def _record_short_code_attempt(
    session: AsyncSession,
    user_id: uuid.UUID,
    value: str,
    now: datetime,
) -> None:
    if not _is_short_code(value):
        return
    attempts = int(
        await session.scalar(
            select(func.count()).select_from(InviteLookupAttempt).where(
                InviteLookupAttempt.user_id == user_id,
                InviteLookupAttempt.attempted_at >= now - timedelta(hours=1),
            )
        )
        or 0
    )
    if attempts >= INVITE_CODE_ATTEMPTS_PER_HOUR:
        raise InviteLookupRateLimitError
    session.add(InviteLookupAttempt(user_id=user_id, attempted_at=now))
    await session.commit()


async def _find_invite(
    session: AsyncSession,
    value: str,
    settings: Settings,
    *,
    lock: bool = False,
) -> Invite:
    token_hash, code_hash = _credential_hashes(value, settings)
    query = select(Invite).where(or_(Invite.token_hash == token_hash, Invite.code_hash == code_hash))
    if lock:
        query = query.with_for_update()
    invite = await session.scalar(query)
    if invite is None:
        raise InviteNotFoundError
    return invite


def _ensure_available(invite: Invite, now: datetime) -> None:
    if invite.revoked_at is not None:
        raise InviteUnavailableError
    if invite.expires_at <= now:
        raise InviteExpiredError
    if invite.use_count >= invite.max_uses:
        raise InviteUnavailableError


async def create_invite(
    session: AsyncSession,
    user: User,
    settings: Settings,
    *,
    now: datetime | None = None,
) -> CreatedInvite:
    current = now or datetime.now(UTC)
    recent_count = int(
        await session.scalar(
            select(func.count()).select_from(Invite).where(
                Invite.inviter_user_id == user.id,
                Invite.created_at >= current - timedelta(days=1),
            )
        )
        or 0
    )
    if recent_count >= INVITE_DAILY_CREATE_LIMIT:
        raise InviteRateLimitError

    token = secrets.token_urlsafe(32)
    compact_code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    code = f"{compact_code[:4]}-{compact_code[4:]}"
    web_url, telegram_url = build_invite_links(token, settings)
    invite = Invite(
        inviter_user_id=user.id,
        purpose="referral_social",
        token_hash=hash_invite_credential(token, settings, kind="token"),
        code_hash=hash_invite_credential(code, settings, kind="code"),
        expires_at=current + timedelta(days=INVITE_TTL_DAYS),
        max_uses=INVITE_MAX_USES,
        use_count=0,
    )
    session.add(invite)
    await session.commit()
    await session.refresh(invite)
    return CreatedInvite(invite, token, code, web_url, telegram_url)


async def preview_invite(
    session: AsyncSession,
    user: User,
    value: str,
    settings: Settings,
    *,
    now: datetime | None = None,
) -> InvitePreview:
    current = now or datetime.now(UTC)
    await _record_short_code_attempt(session, user.id, value, current)
    invite = await _find_invite(session, value, settings)
    if invite.inviter_user_id == user.id:
        raise InviteSelfAcceptError
    inviter = await session.scalar(
        select(User).where(User.id == invite.inviter_user_id, User.is_deleted.is_(False))
    )
    if inviter is None:
        raise InviteUnavailableError
    redemption = await session.scalar(
        select(InviteRedemption).where(
            InviteRedemption.invite_id == invite.id,
            InviteRedemption.user_id == user.id,
        )
    )
    if redemption is None:
        _ensure_available(invite, current)
    mode = _invite_mode(invite, user)
    if mode == "social":
        try:
            await social_service.ensure_social_allowed(session, inviter.id, user.id)
        except social_service.SocialBlockedError as exc:
            raise InviteUnavailableError from exc
    return InvitePreview(invite, inviter_label(inviter), redemption is not None, mode)


async def accept_invite(
    session: AsyncSession,
    user: User,
    value: str,
    settings: Settings,
    *,
    now: datetime | None = None,
) -> AcceptedInvite:
    current = now or datetime.now(UTC)
    await _record_short_code_attempt(session, user.id, value, current)
    invite = await _find_invite(session, value, settings, lock=True)
    if invite.inviter_user_id == user.id:
        raise InviteSelfAcceptError
    inviter = await session.scalar(
        select(User).where(User.id == invite.inviter_user_id, User.is_deleted.is_(False))
    )
    if inviter is None:
        raise InviteUnavailableError
    existing = await session.scalar(
        select(InviteRedemption).where(
            InviteRedemption.invite_id == invite.id,
            InviteRedemption.user_id == user.id,
        )
    )
    mode = _invite_mode(invite, user)
    if existing is not None:
        if mode == "social":
            try:
                linked = await social_service.accept_link_offer(
                    session, inviter, user, now=current
                )
            except social_service.SocialBlockedError as exc:
                raise InviteUnavailableError from exc
            await session.commit()
            return AcceptedInvite(
                inviter_label(inviter),
                True,
                mode,
                linked.friendship.id,
                linked.competition.id if linked.competition else None,
            )
        return AcceptedInvite(inviter_label(inviter), True, mode)

    _ensure_available(invite, current)

    session.add(InviteRedemption(invite_id=invite.id, user_id=user.id, stage="accepted"))
    linked: social_service.SocialLinkResult | None = None
    if mode == "referral":
        attribution = await session.scalar(
            select(ReferralAttribution).where(ReferralAttribution.referred_user_id == user.id)
        )
        if attribution is None:
            session.add(
                ReferralAttribution(
                    invite_id=invite.id,
                    inviter_user_id=invite.inviter_user_id,
                    referred_user_id=user.id,
                )
            )
    else:
        try:
            linked = await social_service.accept_link_offer(session, inviter, user, now=current)
        except social_service.SocialBlockedError as exc:
            raise InviteUnavailableError from exc
    invite.use_count += 1
    await session.commit()
    return AcceptedInvite(
        inviter_label(inviter),
        False,
        mode,
        linked.friendship.id if linked else None,
        linked.competition.id if linked and linked.competition else None,
    )


async def revoke_invite(session: AsyncSession, user: User, invite_id: uuid.UUID) -> None:
    invite = await session.scalar(
        select(Invite).where(Invite.id == invite_id, Invite.inviter_user_id == user.id)
    )
    if invite is None:
        raise InviteNotFoundError
    if invite.revoked_at is None:
        invite.revoked_at = datetime.now(UTC)
        await session.commit()
