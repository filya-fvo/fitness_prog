"""FastAPI dependencies (auth context for protected routes)."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    """Resolve Bearer JWT to an active User row."""
    token = credentials.credentials
    try:
        payload = decode_access_token(token, settings=settings)
        subject = payload.get("sub")
        if not subject:
            raise JWTError("missing sub")
        user_id = uuid.UUID(str(subject))
    except (JWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    result = await session.execute(
        select(User).where(User.id == user_id, User.is_deleted.is_(False))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
