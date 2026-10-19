"""Account-scoped workout customization API."""
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.workout_customization import WorkoutCustomizationRequest, WorkoutCustomizationResponse
from app.services import workout_customization

router = APIRouter(prefix="/customizations", tags=["workouts"])


@router.get("", response_model=WorkoutCustomizationResponse)
async def get_customization(
    program_id: UUID, day_index: int = Query(ge=1, le=7),
    scope: Literal["occurrence", "program_day"] = "program_day", scheduled_date: date | None = None,
    session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    from pydantic import ValidationError
    from fastapi import HTTPException
    try:
        return await workout_customization.get_customization(session, user, program_id=program_id,
            day_index=day_index, scope=scope, scheduled_date=scheduled_date)
    except ValidationError as exc:
        raise HTTPException(422, "Проверьте дату и область применения изменений") from exc


@router.put("", response_model=WorkoutCustomizationResponse)
async def save_customization(body: WorkoutCustomizationRequest, session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await workout_customization.save_customization(session, user, body)


@router.delete("", response_model=WorkoutCustomizationResponse)
async def reset_customization(body: WorkoutCustomizationRequest, session: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await workout_customization.reset_customization(session, user, body)
