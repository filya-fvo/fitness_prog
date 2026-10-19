"""Move date-specific drafts atomically while preserving revisions and personal days."""
from copy import deepcopy
from datetime import date
from hashlib import sha256
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_program_day_override import UserProgramDayOverride


async def change_customization_date(
    session: AsyncSession, user_id: UUID, source_date: date, target_date: date | None,
    program_id: UUID | None = None,
) -> None:
    if source_date == target_date:
        return
    conditions = [UserProgramDayOverride.user_id == user_id,
        UserProgramDayOverride.scheduled_date == source_date, UserProgramDayOverride.is_deleted.is_(False)]
    if program_id is not None:
        conditions.append(UserProgramDayOverride.program_id == program_id)
    rows = await session.scalars(select(UserProgramDayOverride).where(*conditions)
        .order_by(UserProgramDayOverride.program_id, UserProgramDayOverride.day_index))
    for candidate in rows.all():
        key = f"workout-customization:{user_id}:{candidate.program_id}:{candidate.day_index}"
        await session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": key})
        source = await session.scalar(select(UserProgramDayOverride).where(
            *conditions, UserProgramDayOverride.id == candidate.id,
        ).with_for_update().execution_options(populate_existing=True))
        if source is None:
            continue
        action = uuid4()
        digest = sha256(f"{source.id}:{source.revision}:{source_date}:{target_date}".encode()).hexdigest()
        if target_date is not None:
            target = await session.scalar(select(UserProgramDayOverride).where(
                UserProgramDayOverride.user_id == user_id, UserProgramDayOverride.program_id == source.program_id,
                UserProgramDayOverride.day_index == source.day_index, UserProgramDayOverride.scheduled_date == target_date,
            ).with_for_update().execution_options(populate_existing=True))
            if target is not None and not target.is_deleted:
                raise HTTPException(409, "На выбранную дату уже есть подготовка. Сначала проверьте её")
            if target is None:
                target = UserProgramDayOverride(user_id=user_id, program_id=source.program_id,
                    day_index=source.day_index, scheduled_date=target_date, revision=0)
                session.add(target)
            target.program_version = source.program_version
            target.patch = deepcopy(source.patch)
            target.revision += 1
            target.is_deleted = False
            target.last_operation_id = action
            target.last_operation_hash = digest
        source.patch = {}
        source.is_deleted = True
        source.revision += 1
        source.last_operation_id = action
        source.last_operation_hash = digest
