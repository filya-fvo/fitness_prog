"""Exercise catalog routes."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import get_current_user, require_admin, require_plus
from app.models.user import User
from app.schemas.exercise import (
    ExerciseCreate,
    ExerciseExplorerResponse,
    ExerciseListResponse,
    ExercisePinResponse,
    ExerciseResponse,
    ExerciseUpdate,
    StrengthTrendSetsResponse,
)
from app.services import admin_audit, exercise_explorer, exercise_service, strength_trends

router = APIRouter(prefix="/exercises", tags=["exercises"])
_EXPLORER_MESSAGE = "История и подбор упражнений доступны в PLUS"


@router.get("", response_model=ExerciseListResponse)
async def list_exercises(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    muscle_group: str | None = Query(default=None),
    equipment: str | None = Query(default=None),
    q: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ExerciseListResponse:
    items, total = await exercise_service.list_exercises(
        session,
        page=page,
        page_size=page_size,
        muscle_group=muscle_group,
        equipment=equipment,
        q=q,
        tag=tag,
    )
    return ExerciseListResponse(
        items=[ExerciseResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/explorer", response_model=ExerciseExplorerResponse)
async def exercise_progress_explorer(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    scope: Literal["all", "recent", "pinned"] = Query(default="recent"),
    muscle_group: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=100),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_plus("exercise_history", _EXPLORER_MESSAGE)),
) -> ExerciseExplorerResponse:
    result = await exercise_explorer.list_explorer(
        session,
        user_id=user.id,
        page=page,
        page_size=page_size,
        scope=scope,
        muscle_group=muscle_group,
        q=q,
    )
    return ExerciseExplorerResponse.model_validate(result)


@router.get("/strength-trends", response_model=StrengthTrendSetsResponse)
async def strength_trend_sets(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_plus("exercise_history", _EXPLORER_MESSAGE)),
) -> StrengthTrendSetsResponse:
    result = await strength_trends.get_strength_trend_sets(session, user=user)
    return StrengthTrendSetsResponse.model_validate(result)


@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ExerciseResponse:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение не найдено")
    return ExerciseResponse.model_validate(exercise)


async def _pin_response(
    session: AsyncSession,
    user: User,
    exercise_id: uuid.UUID,
    pinned: bool | None,
) -> ExercisePinResponse:
    try:
        result = (
            await exercise_explorer.pin_state(
                session,
                user_id=user.id,
                exercise_id=exercise_id,
            )
            if pinned is None
            else await exercise_explorer.set_pinned(
                session,
                user_id=user.id,
                exercise_id=exercise_id,
                pinned=pinned,
            )
        )
    except exercise_explorer.ExerciseUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Упражнение не найдено",
        ) from exc
    except exercise_explorer.ExercisePinLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Можно закрепить не больше {exercise_explorer.PIN_LIMIT} упражнений",
        ) from exc
    return ExercisePinResponse.model_validate(result)


@router.get("/{exercise_id}/pin", response_model=ExercisePinResponse)
async def get_exercise_pin(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_plus("exercise_history", _EXPLORER_MESSAGE)),
) -> ExercisePinResponse:
    return await _pin_response(session, user, exercise_id, None)


@router.put("/{exercise_id}/pin", response_model=ExercisePinResponse)
async def pin_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_plus("exercise_history", _EXPLORER_MESSAGE)),
) -> ExercisePinResponse:
    return await _pin_response(session, user, exercise_id, True)


@router.delete("/{exercise_id}/pin", response_model=ExercisePinResponse)
async def unpin_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_plus("exercise_history", _EXPLORER_MESSAGE)),
) -> ExercisePinResponse:
    return await _pin_response(session, user, exercise_id, False)


@router.post("", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    body: ExerciseCreate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ExerciseResponse:
    """Admin-only create."""
    exercise = await exercise_service.create_exercise(
        session,
        body,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    return ExerciseResponse.model_validate(exercise)


@router.put("/{exercise_id}", response_model=ExerciseResponse)
async def update_exercise(
    exercise_id: uuid.UUID,
    body: ExerciseUpdate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ExerciseResponse:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение не найдено")
    updated = await exercise_service.update_exercise(
        session,
        exercise,
        body,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    return ExerciseResponse.model_validate(updated)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> None:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение не найдено")
    try:
        await exercise_service.soft_delete_exercise(
            session,
            exercise,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except exercise_service.ExerciseInUseError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Упражнение используется в тренировках или программах. "
                "Сначала замените его во всех связанных записях."
            ),
        ) from exc
