"""Storage and retrieval of sanitized administrator system-status history."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from loguru import logger
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.admin_system_snapshot import AdminSystemSnapshot
from app.schemas.admin_system import (
    AdminSystemCheckKey,
    AdminSystemHistoryItem,
    AdminSystemHistoryResponse,
    AdminSystemHistorySnapshot,
    AdminSystemSnapshotSource,
    AdminSystemStatus,
    AdminSystemStatusResponse,
)
from app.services import admin_system

HISTORY_RETENTION_DAYS = 30
HISTORY_DEFAULT_LIMIT = 192
HISTORY_MAX_LIMIT = 672
_CHECK_ORDER: tuple[AdminSystemCheckKey, ...] = (
    "api",
    "database",
    "redis",
    "worker",
    "notifications",
    "queue",
    "backup",
    "deployment",
    "https",
)
_VALID_STATUSES: set[str] = {"normal", "attention", "error", "no_data"}


def _sanitized_item_statuses(status: AdminSystemStatusResponse) -> dict[str, str]:
    """Keep only the fixed check key and status, never facts or diagnostic text."""
    by_key = {item.key: item.status for item in status.items}
    return {key: by_key[key] for key in _CHECK_ORDER if key in by_key}


async def record_system_snapshot(
    session: AsyncSession,
    status: AdminSystemStatusResponse,
    *,
    source: AdminSystemSnapshotSource,
) -> AdminSystemSnapshot:
    snapshot = AdminSystemSnapshot(
        captured_at=status.checked_at,
        overall_status=status.overall_status,
        item_statuses=_sanitized_item_statuses(status),
        source=source,
    )
    session.add(snapshot)
    cutoff = datetime.now(UTC) - timedelta(days=HISTORY_RETENTION_DAYS)
    await session.execute(
        delete(AdminSystemSnapshot).where(AdminSystemSnapshot.captured_at < cutoff)
    )
    await session.commit()
    return snapshot


async def collect_and_record_system_status(
    session: AsyncSession,
    settings: Settings,
    *,
    source: AdminSystemSnapshotSource,
) -> tuple[AdminSystemStatusResponse, bool]:
    """Collect status and best-effort persist it without breaking live diagnostics."""
    status = await admin_system.collect_system_status(session, settings)
    database_ok = any(
        item.key == "database" and item.status == "normal" for item in status.items
    )
    if not database_ok:
        return status, False
    try:
        await record_system_snapshot(session, status, source=source)
    except Exception as exc:
        try:
            await session.rollback()
        except Exception as rollback_exc:
            logger.warning(
                "admin_system_snapshot_rollback_failed err_type={}",
                type(rollback_exc).__name__,
            )
        logger.warning("admin_system_snapshot_write_failed err_type={}", type(exc).__name__)
        return status, False
    return status, True


def _history_snapshot(row: AdminSystemSnapshot) -> AdminSystemHistorySnapshot:
    raw_items = row.item_statuses if isinstance(row.item_statuses, dict) else {}
    items: list[AdminSystemHistoryItem] = []
    for key in _CHECK_ORDER:
        raw_status = raw_items.get(key)
        if raw_status in _VALID_STATUSES:
            items.append(
                AdminSystemHistoryItem(
                    key=key,
                    status=raw_status,  # type: ignore[arg-type]
                )
            )
    overall: AdminSystemStatus = (
        row.overall_status if row.overall_status in _VALID_STATUSES else "no_data"
    )  # type: ignore[assignment]
    source: AdminSystemSnapshotSource = (
        row.source if row.source in {"manual", "scheduled"} else "scheduled"
    )  # type: ignore[assignment]
    return AdminSystemHistorySnapshot(
        id=row.id,
        captured_at=row.captured_at,
        overall_status=overall,
        source=source,
        items=items,
    )


async def list_system_history(
    session: AsyncSession,
    *,
    limit: int = HISTORY_DEFAULT_LIMIT,
) -> AdminSystemHistoryResponse:
    safe_limit = min(max(1, limit), HISTORY_MAX_LIMIT)
    rows = (
        await session.execute(
            select(AdminSystemSnapshot)
            .order_by(AdminSystemSnapshot.captured_at.desc(), AdminSystemSnapshot.id.desc())
            .limit(safe_limit)
        )
    ).scalars().all()
    return AdminSystemHistoryResponse(
        snapshots=[_history_snapshot(row) for row in rows],
        retention_days=HISTORY_RETENTION_DAYS,
    )
