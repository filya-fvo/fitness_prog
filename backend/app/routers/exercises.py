"""Exercise catalog routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.exercise import (
    ExerciseCreate,
    ExerciseListResponse,
    ExerciseResponse,
    ExerciseUpdate,
)
from app.services import exercise_service

router = APIRouter(prefix="/exercises", tags=["exercises"])


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


@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ExerciseResponse:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return ExerciseResponse.model_validate(exercise)


@router.post("", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    body: ExerciseCreate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ExerciseResponse:
    """Admin-style create used by simple admin CRUD in Sprint 2."""
    exercise = await exercise_service.create_exercise(session, body)
    return ExerciseResponse.model_validate(exercise)


@router.put("/{exercise_id}", response_model=ExerciseResponse)
async def update_exercise(
    exercise_id: uuid.UUID,
    body: ExerciseUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ExerciseResponse:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    updated = await exercise_service.update_exercise(session, exercise, body)
    return ExerciseResponse.model_validate(updated)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    await exercise_service.soft_delete_exercise(session, exercise)
