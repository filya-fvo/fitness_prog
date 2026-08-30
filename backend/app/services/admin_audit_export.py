"""Bounded CSV/JSON export for the immutable administrator audit journal."""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.admin_audit import AdminAuditEntry, AdminAuditExportRequest
from app.services import admin_audit

AuditExportFormat = Literal["csv", "json"]
AUDIT_EXPORT_MAX_ROWS = 1000
_CSV_FIELDS = (
    "id",
    "created_at",
    "actor_user_id",
    "actor_label",
    "action",
    "object_type",
    "object_id",
    "object_label",
    "result",
    "description",
    "before",
    "after",
    "notification_status",
    "correlation_id",
)


@dataclass(frozen=True, slots=True)
class AuditExportArtifact:
    content: bytes
    media_type: str
    filename: str
    exported_count: int
    total_matches: int

    @property
    def truncated(self) -> bool:
        return self.total_matches > self.exported_count


def _csv_safe(value: object) -> str:
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(("=", "+", "-", "@", "\t", "\r")) else text


def _entry_row(entry: AdminAuditEntry) -> dict[str, str]:
    return {
        "id": str(entry.id),
        "created_at": entry.created_at.astimezone(UTC).isoformat(),
        "actor_user_id": str(entry.actor_user_id or ""),
        "actor_label": _csv_safe(entry.actor_label),
        "action": _csv_safe(entry.action),
        "object_type": _csv_safe(entry.object_type),
        "object_id": str(entry.object_id or ""),
        "object_label": _csv_safe(entry.object_label or ""),
        "result": entry.result,
        "description": _csv_safe(entry.description),
        "before": _csv_safe(json.dumps(entry.before, ensure_ascii=False, separators=(",", ":"))),
        "after": _csv_safe(json.dumps(entry.after, ensure_ascii=False, separators=(",", ":"))),
        "notification_status": _csv_safe(entry.notification_status or ""),
        "correlation_id": str(entry.correlation_id),
    }


def _csv_content(items: list[AdminAuditEntry]) -> bytes:
    output = io.StringIO(newline="")
    output.write("\ufeff")
    writer = csv.DictWriter(output, fieldnames=_CSV_FIELDS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(_entry_row(item) for item in items)
    return output.getvalue().encode("utf-8")


def _json_content(
    items: list[AdminAuditEntry],
    *,
    filters: AdminAuditExportRequest,
    total_matches: int,
) -> bytes:
    payload = {
        "format_version": 1,
        "generated_at": datetime.now(UTC),
        "filters": filters,
        "max_rows": AUDIT_EXPORT_MAX_ROWS,
        "exported_count": len(items),
        "total_matches": total_matches,
        "truncated": total_matches > len(items),
        "items": items,
    }
    return json.dumps(
        jsonable_encoder(payload),
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")


async def prepare_audit_export(
    session: AsyncSession,
    filters: AdminAuditExportRequest,
    *,
    export_format: AuditExportFormat,
    context: admin_audit.AuditContext,
) -> AuditExportArtifact:
    items, total = await admin_audit.query_event_page(
        session,
        date_from=filters.date_from,
        date_to=filters.date_to,
        actor_user_id=filters.actor_user_id,
        query=filters.query,
        action=filters.action,
        result=filters.result,
        limit=AUDIT_EXPORT_MAX_ROWS,
        max_limit=AUDIT_EXPORT_MAX_ROWS,
    )
    content = (
        _csv_content(items)
        if export_format == "csv"
        else _json_content(items, filters=filters, total_matches=total)
    )
    admin_audit.add_event(
        session,
        context=context,
        action="audit.export",
        object_type="audit_export",
        object_id=None,
        result="success",
        description="Подготовлена выгрузка журнала действий.",
        after={
            "format": export_format,
            "exported_count": len(items),
            "total_matches": total,
            "truncated": total > len(items),
        },
        notification_status="not_requested",
    )
    await session.commit()
    generated = datetime.now(UTC)
    return AuditExportArtifact(
        content=content,
        media_type=(
            "text/csv; charset=utf-8"
            if export_format == "csv"
            else "application/json; charset=utf-8"
        ),
        filename=f"fitness-admin-audit-{generated:%Y%m%d-%H%M%S}.{export_format}",
        exported_count=len(items),
        total_matches=total,
    )
