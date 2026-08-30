"""Administrator-only read-only system diagnostics."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import require_system_admin
from app.schemas.admin_system import AdminSystemHistoryResponse, AdminSystemStatusResponse
from app.services import admin_system, admin_system_history

router = APIRouter(prefix="/admin/system", tags=["admin-system"])


@router.get("/status", response_model=AdminSystemStatusResponse)
async def get_admin_system_status(
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: None = Depends(require_system_admin),
) -> AdminSystemStatusResponse:
    return await admin_system.collect_system_status(session, settings)


@router.post("/status/check", response_model=AdminSystemStatusResponse)
async def check_and_record_admin_system_status(
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: None = Depends(require_system_admin),
) -> AdminSystemStatusResponse:
    status, _recorded = await admin_system_history.collect_and_record_system_status(
        session,
        settings,
        source="manual",
    )
    return status


@router.get("/history", response_model=AdminSystemHistoryResponse)
async def get_admin_system_history(
    limit: int = Query(
        default=admin_system_history.HISTORY_DEFAULT_LIMIT,
        ge=1,
        le=admin_system_history.HISTORY_MAX_LIMIT,
    ),
    session: AsyncSession = Depends(get_db),
    _: None = Depends(require_system_admin),
) -> AdminSystemHistoryResponse:
    return await admin_system_history.list_system_history(session, limit=limit)
