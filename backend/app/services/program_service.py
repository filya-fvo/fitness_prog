"""Program catalog business logic."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.program import Program
from app.models.exercise import Exercise
from app.schemas.program import PersonalProgramCreate, ProgramCreate, ProgramUpdate
from app.services import admin_audit, program_publication


async def list_programs(
    session: AsyncSession,
    *,
    workout_type: str | None = None,
    level: str | None = None,
    templates_only: bool = False,
    include_unpublished: bool = False,
) -> tuple[list[Program], int]:
    filters = [Program.is_deleted.is_(False), Program.owner_id.is_(None)]
    if not include_unpublished:
        filters.extend(
            [
                Program.publication_status == "published",
                Program.is_current.is_(True),
            ]
        )
    if workout_type:
        filters.append(Program.workout_type == workout_type)
    if level:
        filters.append(or_(Program.level == level, Program.target_level == level))
    if templates_only:
        filters.append(Program.is_template.is_(True))

    total = await session.scalar(select(func.count()).select_from(Program).where(*filters))
    result = await session.execute(select(Program).where(*filters).order_by(Program.name.asc()))
    return list(result.scalars().all()), int(total or 0)


async def get_program(
    session: AsyncSession,
    program_id: uuid.UUID,
    *,
    active_program_id: object = None,
    user_id: uuid.UUID | None = None,
) -> Program | None:
    result = await session.execute(
        select(Program).where(Program.id == program_id, Program.is_deleted.is_(False))
    )
    program = result.scalar_one_or_none()
    if program is None or not program_publication.is_accessible_to_user(
        program, active_program_id, user_id=user_id
    ):
        return None
    return program


async def list_personal_programs(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> tuple[list[Program], int]:
    filters = [Program.owner_id == user_id, Program.is_deleted.is_(False)]
    total = await session.scalar(select(func.count()).select_from(Program).where(*filters))
    result = await session.execute(
        select(Program).where(*filters).order_by(Program.created_at.desc()).limit(100)
    )
    return list(result.scalars().all()), int(total or 0)


async def create_personal_program(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    data: PersonalProgramCreate,
) -> Program:
    exercise_ids = {item.exercise_id for day in data.days for item in day.exercises}
    result = await session.scalars(
        select(Exercise).where(Exercise.id.in_(exercise_ids), Exercise.is_deleted.is_(False))
    )
    by_id = {exercise.id: exercise for exercise in result.all()}
    if len(by_id) != len(exercise_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Одно из упражнений больше недоступно. Выберите другое.",
        )

    schedule = [
        {
            "day_index": day_index,
            "name": day.name.strip(),
            "exercises": [
                {
                    "exercise_id": str(item.exercise_id),
                    "exercise_name": by_id[item.exercise_id].name_ru,
                    "sets": item.sets,
                    "reps": item.reps.strip(),
                    "rest_sec": item.rest_sec,
                }
                for item in day.exercises
            ],
        }
        for day_index, day in enumerate(data.days, start=1)
    ]
    program = Program(
        name=data.name.strip(),
        description=(
            "Личная программа · "
            + ("одинаковые подходы каждую неделю" if data.progression == "linear" else "чередование лёгкой, средней и тяжёлой недели")
        ),
        duration_weeks=data.duration_weeks,
        structure={
            "days_per_week": len(schedule),
            "location": data.location,
            "progression": data.progression,
            "schedule": schedule,
        },
        workout_type="custom",
        is_template=False,
        owner_id=user_id,
        publication_status="published",
        is_current=True,
        published_at=datetime.now(UTC),
        program_key=f"personal-{uuid.uuid4().hex}",
    )
    session.add(program)
    await session.commit()
    await session.refresh(program)
    return program


async def get_program_for_admin(session: AsyncSession, program_id: uuid.UUID) -> Program | None:
    result = await session.execute(
        select(Program).where(
            Program.id == program_id,
            Program.is_deleted.is_(False),
            Program.owner_id.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create_program(
    session: AsyncSession,
    data: ProgramCreate,
    *,
    audit_context: admin_audit.AuditContext | None = None,
) -> Program:
    program = Program(
        **data.model_dump(),
        publication_status="draft",
        is_current=False,
    )
    session.add(program)
    await session.flush()
    if audit_context is not None:
        admin_audit.add_event(
            session,
            context=audit_context,
            action="program.create",
            object_type="program",
            object_id=program.id,
            result="success",
            description="Создан черновик программы.",
            after=admin_audit.program_snapshot(program),
        )
    await session.commit()
    await session.refresh(program)
    return program


async def update_program(
    session: AsyncSession,
    program: Program,
    data: ProgramUpdate,
    *,
    audit_context: admin_audit.AuditContext | None = None,
) -> Program:
    if program.publication_status in {"published", "archived"}:
        source = program
        program = await program_publication.create_draft_version(session, source)
        action = "program.draft.create"
        description = "Создана новая черновая версия программы."
    else:
        action = "program.update"
        description = "Черновик программы изменён."
    before = admin_audit.program_snapshot(program)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(program, key, value)
    if audit_context is not None:
        admin_audit.add_event(
            session,
            context=audit_context,
            action=action,
            object_type="program",
            object_id=program.id,
            result="success",
            description=description,
            before=before,
            after=admin_audit.program_snapshot(program),
        )
    await session.commit()
    await session.refresh(program)
    return program


async def soft_delete_program(
    session: AsyncSession,
    program: Program,
    *,
    audit_context: admin_audit.AuditContext | None = None,
) -> None:
    before = admin_audit.program_snapshot(program)
    if program.publication_status in {"published", "archived"}:
        program.publication_status = "archived"
        program.is_current = False
        description = "Программа скрыта из каталога; закреплённая версия сохранена."
    else:
        program.is_deleted = True
        description = "Черновик программы удалён."
    if audit_context is not None:
        admin_audit.add_event(
            session,
            context=audit_context,
            action="program.archive",
            object_type="program",
            object_id=program.id,
            result="success",
            description=description,
            before=before,
            after=admin_audit.program_snapshot(program),
        )
    await session.commit()
