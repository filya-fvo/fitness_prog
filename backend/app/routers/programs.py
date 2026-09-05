"""Program catalog routes."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import get_current_user, require_admin, user_is_admin
from app.models.user import User
from app.schemas.program import (
    ProgramCreate,
    ProgramListResponse,
    ProgramPublicationResponse,
    ProgramResponse,
    ProgramStartRequest,
    ProgramUpdate,
)
from app.schemas.workout import WorkoutPlan, WorkoutResponse
from app.services import admin_audit, program_publication, program_service, workout_service

router = APIRouter(prefix="/programs", tags=["programs"])


@router.get("", response_model=ProgramListResponse)
async def list_programs(
    workout_type: str | None = Query(default=None),
    level: str | None = Query(default=None),
    templates_only: bool = Query(default=False),
    admin_view: bool = Query(default=False),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramListResponse:
    if admin_view and not user_is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права администратора")
    items, total = await program_service.list_programs(
        session,
        workout_type=workout_type,
        level=level,
        templates_only=templates_only,
        include_unpublished=admin_view,
    )
    return ProgramListResponse(
        items=[ProgramResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get("/{program_id}", response_model=ProgramResponse)
async def get_program(
    program_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramResponse:
    program = await program_service.get_program(
        session,
        program_id,
        active_program_id=(user.goals or {}).get("active_program_id"),
    )
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    return ProgramResponse.model_validate(program)


@router.post("/{program_id}/start", response_model=WorkoutResponse, status_code=status.HTTP_201_CREATED)
async def start_program(
    program_id: uuid.UUID,
    body: ProgramStartRequest | None = None,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutResponse:
    payload = body or ProgramStartRequest()
    workout = await workout_service.start_program_workout(
        session,
        user,
        program_id,
        day_index=payload.day_index,
        scheduled_date=payload.scheduled_date,
        week_phase=payload.week_phase,
    )
    return WorkoutResponse.model_validate(workout)


@router.post("", response_model=ProgramResponse, status_code=status.HTTP_201_CREATED)
async def create_program(
    body: ProgramCreate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ProgramResponse:
    program = await program_service.create_program(
        session,
        body,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    return ProgramResponse.model_validate(program)


@router.put("/{program_id}", response_model=ProgramResponse)
async def update_program(
    program_id: uuid.UUID,
    body: ProgramUpdate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ProgramResponse:
    program = await program_service.get_program_for_admin(session, program_id)
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    updated = await program_service.update_program(
        session,
        program,
        body,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    return ProgramResponse.model_validate(updated)


@router.delete("/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program(
    program_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> None:
    program = await program_service.get_program_for_admin(session, program_id)
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    await program_service.soft_delete_program(
        session,
        program,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )


def _publication_error(exc: program_publication.ProgramPublicationError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Публикация невозможна: " + " ".join(exc.errors[:5]),
    )


@router.post("/{program_id}/publish", response_model=ProgramPublicationResponse)
async def publish_program(
    program_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ProgramPublicationResponse:
    program = await program_service.get_program_for_admin(session, program_id)
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    try:
        published = await program_publication.publish(
            session,
            program,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except program_publication.ProgramPublicationError as exc:
        raise _publication_error(exc) from exc
    return ProgramPublicationResponse(
        program=ProgramResponse.model_validate(published),
        message="Программа опубликована.",
    )


@router.post("/{program_id}/rollback", response_model=ProgramPublicationResponse)
async def rollback_program(
    program_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ProgramPublicationResponse:
    program = await program_service.get_program_for_admin(session, program_id)
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    try:
        restored = await program_publication.rollback(
            session,
            program,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except program_publication.ProgramPublicationError as exc:
        raise _publication_error(exc) from exc
    return ProgramPublicationResponse(
        program=ProgramResponse.model_validate(restored),
        message="Предыдущая версия восстановлена.",
    )


@router.post("/{program_id}/preview", response_model=WorkoutPlan)
async def preview_program(
    program_id: uuid.UUID,
    day_index: int = Query(default=1, ge=1, le=7),
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> WorkoutPlan:
    program = await program_service.get_program_for_admin(session, program_id)
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    plan = await workout_service.build_program_plan_for_user(
        session,
        admin,
        program,
        day_index=day_index,
        scheduled_date=date.today(),
        week_phase=None,
        include_saved_override=False,
        apply_readiness_adjustment=False,
    )
    return WorkoutPlan.model_validate(plan)
