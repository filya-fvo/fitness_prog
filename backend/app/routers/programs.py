"""Program catalog routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import get_current_user, require_admin
from app.models.user import User
from app.schemas.program import (
    ProgramCreate,
    ProgramListResponse,
    ProgramResponse,
    ProgramStartRequest,
    ProgramUpdate,
)
from app.schemas.workout import WorkoutResponse
from app.services import admin_audit, program_service, workout_service

router = APIRouter(prefix="/programs", tags=["programs"])


@router.get("", response_model=ProgramListResponse)
async def list_programs(
    workout_type: str | None = Query(default=None),
    level: str | None = Query(default=None),
    templates_only: bool = Query(default=False),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProgramListResponse:
    items, total = await program_service.list_programs(
        session,
        workout_type=workout_type,
        level=level,
        templates_only=templates_only,
    )
    return ProgramListResponse(
        items=[ProgramResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get("/{program_id}", response_model=ProgramResponse)
async def get_program(
    program_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProgramResponse:
    program = await program_service.get_program(session, program_id)
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
    program = await program_service.get_program(session, program_id)
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
    program = await program_service.get_program(session, program_id)
    if program is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Программа не найдена")
    await program_service.soft_delete_program(
        session,
        program,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
