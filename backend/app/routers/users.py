"""User profile routes — GET/PUT /users/me (API contract)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserProfileResponse, UserProfileUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileResponse)
async def get_me(user: User = Depends(get_current_user)) -> UserProfileResponse:
    return user_service.to_profile(user)


@router.put("/me", response_model=UserProfileResponse)
async def update_me(
    body: UserProfileUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserProfileResponse:
    updated = await user_service.update_profile(session, user, body)
    return user_service.to_profile(updated)
