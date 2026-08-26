"""Administrator-only read-only system diagnostics."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.deps import require_system_admin
from app.schemas.admin_system import AdminSystemStatusResponse
from app.services import admin_system

router = APIRouter(prefix="/admin/system", tags=["admin-system"])


@router.get("/status", response_model=AdminSystemStatusResponse)
async def get_admin_system_status(
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: None = Depends(require_system_admin),
) -> AdminSystemStatusResponse:
    return await admin_system.collect_system_status(session, settings)
