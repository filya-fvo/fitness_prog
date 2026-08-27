"""Administrator-only broadcast center API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import require_admin
from app.models.user import User
from app.schemas.admin_broadcast import (
    AdminBroadcastAudience,
    AdminBroadcastAudiencePreview,
    AdminBroadcastCopyRequest,
    AdminBroadcastDraftRequest,
    AdminBroadcastLaunchRequest,
    AdminBroadcastListResponse,
    AdminBroadcastResponse,
    AdminBroadcastRetryRequest,
    AdminBroadcastUpdateRequest,
)
from app.services import admin_audit, admin_broadcasts
from app.services.admin_broadcast_audience import audience_count

router = APIRouter(prefix="/admin/broadcasts", tags=["admin"])


def _context(admin: User, correlation_id: uuid.UUID) -> admin_audit.AuditContext:
    return admin_audit.AuditContext(admin.id, correlation_id)


async def _enqueue(settings: Settings, campaign: AdminBroadcastResponse) -> None:
    try:
        await admin_broadcasts.enqueue_campaign(settings, campaign)
    except Exception as exc:
        logger.error(
            "admin_broadcast_enqueue_failed campaign={} err_type={}",
            campaign.id,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Очередь временно недоступна. Рассылка сохранена и может быть возобновлена.",
        ) from exc


@router.post("/audience-preview", response_model=AdminBroadcastAudiencePreview)
async def preview_audience(
    body: AdminBroadcastAudience,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminBroadcastAudiencePreview:
    return AdminBroadcastAudiencePreview(expected_count=await audience_count(session, body))


@router.get("", response_model=AdminBroadcastListResponse)
async def list_broadcasts(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminBroadcastListResponse:
    return await admin_broadcasts.list_campaigns(session, limit=limit, offset=offset)


@router.post("", response_model=AdminBroadcastResponse, status_code=status.HTTP_201_CREATED)
async def create_broadcast(
    body: AdminBroadcastDraftRequest,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminBroadcastResponse:
    return await admin_broadcasts.create_draft(session, body, context=_context(admin, correlation_id))


@router.get("/{campaign_id}", response_model=AdminBroadcastResponse)
async def get_broadcast(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminBroadcastResponse:
    return await admin_broadcasts.get_campaign(session, campaign_id)


@router.put("/{campaign_id}", response_model=AdminBroadcastResponse)
async def update_broadcast(
    campaign_id: uuid.UUID,
    body: AdminBroadcastUpdateRequest,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminBroadcastResponse:
    return await admin_broadcasts.update_draft(
        session, campaign_id, body, context=_context(admin, correlation_id)
    )


@router.post("/{campaign_id}/test", response_model=AdminBroadcastResponse)
async def test_broadcast(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminBroadcastResponse:
    return await admin_broadcasts.test_delivery(
        session,
        campaign_id,
        admin=admin,
        settings=settings,
        context=_context(admin, correlation_id),
    )


@router.post("/{campaign_id}/launch", response_model=AdminBroadcastResponse)
async def launch_broadcast(
    campaign_id: uuid.UUID,
    body: AdminBroadcastLaunchRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminBroadcastResponse:
    campaign = await admin_broadcasts.launch(
        session,
        campaign_id,
        expected_count=body.expected_recipient_count,
        confirmation_text=body.confirmation_text,
        confirmed=body.confirmed,
        scheduled_at=body.scheduled_at,
        context=_context(admin, correlation_id),
    )
    await _enqueue(settings, campaign)
    return campaign


@router.post("/{campaign_id}/retry", response_model=AdminBroadcastResponse)
async def retry_broadcast(
    campaign_id: uuid.UUID,
    body: AdminBroadcastRetryRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminBroadcastResponse:
    campaign = await admin_broadcasts.retry_failed(
        session,
        campaign_id,
        confirmed=body.confirmed,
        confirmation_text=body.confirmation_text,
        context=_context(admin, correlation_id),
    )
    await _enqueue(settings, campaign)
    return campaign


@router.post("/{campaign_id}/copy", response_model=AdminBroadcastResponse)
async def copy_broadcast(
    campaign_id: uuid.UUID,
    body: AdminBroadcastCopyRequest,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminBroadcastResponse:
    return await admin_broadcasts.copy_as_draft(
        session,
        campaign_id,
        idempotency_key=body.idempotency_key,
        context=_context(admin, correlation_id),
    )


@router.post("/{campaign_id}/resume", response_model=AdminBroadcastResponse)
async def resume_broadcast(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminBroadcastResponse:
    campaign = await admin_broadcasts.record_resume(
        session, campaign_id, context=_context(admin, correlation_id)
    )
    await _enqueue(settings, campaign)
    return campaign
