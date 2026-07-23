"""Program catalog business logic."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.program import Program
from app.schemas.program import ProgramCreate, ProgramUpdate


async def list_programs(
    session: AsyncSession,
    *,
    workout_type: str | None = None,
    level: str | None = None,
    templates_only: bool = False,
) -> tuple[list[Program], int]:
    filters = [Program.is_deleted.is_(False)]
    if workout_type:
        filters.append(Program.workout_type == workout_type)
    if level:
        filters.append(or_(Program.level == level, Program.target_level == level))
    if templates_only:
        filters.append(Program.is_template.is_(True))

    total = await session.scalar(select(func.count()).select_from(Program).where(*filters))
    result = await session.execute(select(Program).where(*filters).order_by(Program.name.asc()))
    return list(result.scalars().all()), int(total or 0)


async def get_program(session: AsyncSession, program_id: uuid.UUID) -> Program | None:
    result = await session.execute(
        select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
    )
    return result.scalar_one_or_none()


async def create_program(session: AsyncSession, data: ProgramCreate) -> Program:
    program = Program(**data.model_dump())
    session.add(program)
    await session.commit()
    await session.refresh(program)
    return program


async def update_program(session: AsyncSession, program: Program, data: ProgramUpdate) -> Program:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(program, key, value)
    await session.commit()
    await session.refresh(program)
    return program


async def soft_delete_program(session: AsyncSession, program: Program) -> None:
    program.is_deleted = True
    await session.commit()
