"""Validated and atomic JSON imports for the administrator exercise catalog."""

from __future__ import annotations

import hashlib
import json

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.schemas.admin_exercise import (
    ExerciseDuplicateCandidate,
    ExerciseImportApplyResponse,
    ExerciseImportPreviewResponse,
    ExerciseImportPreviewRow,
)
from app.schemas.exercise import ExerciseCreate
from app.services import admin_audit, admin_exercises


class ExerciseImportError(RuntimeError):
    """The confirmed package no longer matches a successful preview."""


def import_fingerprint(raw_items: list[dict[str, object]]) -> str:
    canonical = json.dumps(
        raw_items,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


async def preview_import(
    session: AsyncSession,
    raw_items: list[dict[str, object]],
) -> ExerciseImportPreviewResponse:
    rows: list[ExerciseImportPreviewRow] = []
    seen: set[str] = set()
    catalog_result = await session.execute(select(Exercise).where(Exercise.is_deleted.is_(False)))
    catalog = list(catalog_result.scalars().all())
    for index, raw in enumerate(raw_items, start=1):
        errors: list[str] = []
        name = str(raw.get("name_ru") or "").strip() or None
        try:
            item = ExerciseCreate.model_validate(raw)
        except ValidationError as exc:
            errors.extend(
                f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}"
                for issue in exc.errors(include_url=False)[:8]
            )
            item = None
        duplicates: list[ExerciseDuplicateCandidate] = []
        if name:
            normalized = admin_exercises.normalize_exercise_name(name)
            if normalized in seen:
                errors.append("Название повторяется внутри файла.")
            seen.add(normalized)
            duplicates = admin_exercises.duplicate_candidates(catalog, name)
            if any(candidate.similarity == 1 for candidate in duplicates):
                errors.append("Такое название уже есть в каталоге.")
        rows.append(
            ExerciseImportPreviewRow(
                row=index,
                name_ru=item.name_ru if item else name,
                valid=not errors,
                errors=errors,
                duplicates=duplicates,
            )
        )
    valid = sum(row.valid for row in rows)
    return ExerciseImportPreviewResponse(
        total=len(rows),
        valid=valid,
        invalid=len(rows) - valid,
        fingerprint=import_fingerprint(raw_items),
        rows=rows,
    )


async def apply_import(
    session: AsyncSession,
    raw_items: list[dict[str, object]],
    *,
    fingerprint: str,
    confirmed: bool,
    audit_context: admin_audit.AuditContext,
) -> ExerciseImportApplyResponse:
    """Revalidate and atomically import the exact package reviewed by the admin."""
    if not confirmed or fingerprint != import_fingerprint(raw_items):
        raise ExerciseImportError("Import confirmation does not match preview")
    preview = await preview_import(session, raw_items)
    if preview.invalid or preview.fingerprint != fingerprint:
        raise ExerciseImportError("Import package is no longer valid")

    exercises = [Exercise(**ExerciseCreate.model_validate(item).model_dump()) for item in raw_items]
    try:
        session.add_all(exercises)
        await session.flush()
        admin_audit.add_event(
            session,
            context=audit_context,
            action="exercise.import",
            object_type="exercise_import",
            object_id=None,
            result="success",
            description="Пакет упражнений импортирован в каталог.",
            after={"imported_count": len(exercises), "source": "json"},
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return ExerciseImportApplyResponse(imported=len(exercises), fingerprint=fingerprint)
