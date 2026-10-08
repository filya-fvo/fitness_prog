from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import DBAPIError
from pydantic import ValidationError
from app.deps import get_current_user
from app.models.user import User
from app.core.database import engine
from app.schemas.android_sync import Operation
from app.services.android_sync import service as sync_service

router = APIRouter(prefix="/android-sync/v1", tags=["android-sync"])


def failure(error: DBAPIError):
    # No SQL text/parameters in API detail/logs.
    raise HTTPException(503, "Синхронизация временно недоступна. Повторите позже.") from error


@router.post("/push")
async def push(body: Operation, user: User = Depends(get_current_user)):
    try:
        return await sync_service.push(engine, user.id, body)
    except DBAPIError as error:
        failure(error)
    except (ValidationError, ValueError) as error:
        raise HTTPException(422, "Проверьте данные записи") from error


@router.get("/pull")
async def pull(
    cursor: int = Query(0, ge=0, le=9223372036854775807),
    limit: int = Query(100, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    try:
        return await sync_service.pull(engine, user.id, cursor, limit)
    except DBAPIError as error:
        failure(error)
    except (ValidationError, ValueError) as error:
        raise HTTPException(422, "Проверьте данные записи") from error
