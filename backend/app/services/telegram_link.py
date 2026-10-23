"""Attach a bot-confirmed identity to an authenticated account transactionally."""

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.android_login import AndroidLogin
from app.models.user import User
from app.services import android_login
from app.services.account_merge import MergePreference, merge_accounts, merge_preview


@dataclass
class LinkResult:
    user: User | None = None
    merge_required: bool = False
    preview: dict | None = None
    merge_target_id: UUID | None = None


async def start_link(
    session: AsyncSession, *, user: User, challenge: str, bot_username: str, source_hash: str
) -> dict:
    if user.is_deleted or user.telegram_id is not None:
        raise HTTPException(409, "Telegram уже подключён. Обновите профиль.")
    return await android_login.start_login(
        session, challenge, bot_username, source_hash, owner_user_id=user.id
    )


async def complete_link(
    session: AsyncSession,
    *,
    user: User,
    request_id: UUID,
    verifier: str,
    merge_preference: MergePreference | None = None,
    merge_target_id: UUID | None = None,
) -> LinkResult:
    owner_id = user.id
    row = await session.scalar(
        select(AndroidLogin)
        .where(
            *android_login.proof(request_id, verifier, owner_user_id=owner_id),
            AndroidLogin.approved_at.is_not(None),
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None or row.telegram_id is None:
        raise android_login.unavailable()
    telegram_id = row.telegram_id
    # Stable ordering matches the existing merge service; refresh identity-map
    # values after waiting for another transaction's locks.
    locked = list(
        (
            await session.scalars(
                select(User)
                .where(
                    or_(
                        User.id == owner_id,
                        User.telegram_id == telegram_id,
                    )
                )
                .order_by(User.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    current = next((item for item in locked if item.id == owner_id), None)
    target = next((item for item in locked if item.telegram_id == telegram_id), None)
    if current is None or current.is_deleted:
        raise HTTPException(409, "Аккаунт изменился. Войдите снова.")
    if current.telegram_id not in {None, telegram_id}:
        raise HTTPException(409, "К аккаунту уже подключён другой Telegram.")
    if target is not None and target.is_deleted:
        raise HTTPException(409, "Этот Telegram недоступен для подключения.")
    if target is not None and target.id != owner_id:
        if merge_preference is None:
            preview = await merge_preview(session, email_user=current, telegram_user=target)
            target_id = target.id
            await session.rollback()
            return LinkResult(merge_required=True, preview=preview, merge_target_id=target_id)
        if merge_target_id != target.id:
            raise HTTPException(409, "Аккаунты изменились. Начните подключение заново.")
    elif merge_preference is not None:
        raise HTTPException(409, "Аккаунты изменились. Начните подключение заново.")
    # Recheck expiry after lock waits and consume within the same transaction as
    # the identity update or canonical merge. Failure rolls consumption back too.
    consumed = await session.scalar(
        update(AndroidLogin)
        .where(
            *android_login.proof(request_id, verifier, owner_user_id=owner_id),
            AndroidLogin.approved_at.is_not(None),
        )
        .values(consumed_at=datetime.now(timezone.utc))
        .returning(AndroidLogin.id)
    )
    if consumed is None:
        raise android_login.unavailable()
    try:
        if target is not None and target.id != owner_id:
            result = await merge_accounts(
                session, email_user=current, telegram_user=target, preference=merge_preference
            )
            return LinkResult(user=result.user)
        current.telegram_id = telegram_id
        current.username = (row.actor or {}).get("username")
        await session.commit()
        await session.refresh(current)
        return LinkResult(user=current)
    except (IntegrityError, ValueError) as error:
        await session.rollback()
        raise HTTPException(409, "Аккаунты изменились. Повторите подключение.") from error
