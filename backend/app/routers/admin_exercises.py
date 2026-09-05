"""Administrator-only exercise editor routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.request_id import get_request_id
from app.deps import require_admin, require_system_admin
from app.models.user import User
from app.schemas.admin_exercise import (
    AdminExerciseItem,
    AdminExerciseListResponse,
    AdminExerciseOptions,
    ExerciseImportApplyRequest,
    ExerciseImportApplyResponse,
    ExerciseImportPreviewRequest,
    ExerciseImportPreviewResponse,
    ExerciseMediaCheckRequest,
    ExerciseMediaCheckResponse,
    ExerciseMediaUploadResponse,
    ExercisePreflightRequest,
    ExercisePreflightResponse,
    MediaQuality,
    UploadMediaField,
)
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate
from app.services import (
    admin_audit,
    admin_exercise_import,
    admin_exercise_media,
    admin_exercises,
    exercise_service,
)

router = APIRouter(prefix="/admin/exercises", tags=["admin-exercises"])


@router.get("", response_model=AdminExerciseListResponse)
async def list_exercises(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
    muscle_group: str | None = Query(default=None, max_length=100),
    equipment: str | None = Query(default=None, max_length=100),
    difficulty: int | None = Query(default=None, ge=1, le=5),
    tag: str | None = Query(default=None, max_length=100),
    weight_rule: str | None = Query(default=None, pattern=r"^(total|per_hand|per_side|none)$"),
    media_quality: MediaQuality | None = Query(default=None),
    archived: bool = Query(default=False),
    session: AsyncSession = Depends(get_db),
    _: None = Depends(require_system_admin),
) -> AdminExerciseListResponse:
    items, total = await admin_exercises.list_admin_exercises(
        session,
        page=page,
        page_size=page_size,
        q=q,
        muscle_group=muscle_group,
        equipment=equipment,
        difficulty=difficulty,
        tag=tag,
        weight_rule=weight_rule,
        quality=media_quality,
        archived=archived,
    )
    return AdminExerciseListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/options", response_model=AdminExerciseOptions)
async def options(
    session: AsyncSession = Depends(get_db),
    _: None = Depends(require_system_admin),
) -> AdminExerciseOptions:
    return await admin_exercises.get_options(session)


@router.post("/media-check", response_model=ExerciseMediaCheckResponse)
async def media_check(
    body: ExerciseMediaCheckRequest,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_db),
    _: None = Depends(require_system_admin),
) -> ExerciseMediaCheckResponse:
    return await admin_exercises.check_media(body, settings, session=session)


@router.post("/preflight", response_model=ExercisePreflightResponse)
async def preflight(
    body: ExercisePreflightRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: None = Depends(require_system_admin),
) -> ExercisePreflightResponse:
    return await admin_exercises.preflight(session, body, settings)


@router.post("/import/preview", response_model=ExerciseImportPreviewResponse)
async def preview_import(
    body: ExerciseImportPreviewRequest,
    session: AsyncSession = Depends(get_db),
    _: None = Depends(require_system_admin),
) -> ExerciseImportPreviewResponse:
    return await admin_exercise_import.preview_import(session, body.items)


@router.post("/import/apply", response_model=ExerciseImportApplyResponse)
async def apply_import(
    body: ExerciseImportApplyRequest,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ExerciseImportApplyResponse:
    try:
        return await admin_exercise_import.apply_import(
            session,
            body.items,
            fingerprint=body.fingerprint,
            confirmed=body.confirmed,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except admin_exercise_import.ExerciseImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пакет изменился или больше не проходит проверку. Проверьте JSON ещё раз.",
        ) from exc


def _item(exercise, *, workout_uses: int = 0, program_uses: int = 0) -> AdminExerciseItem:
    return AdminExerciseItem.model_validate(
        {
            **exercise.__dict__,
            "media_quality": admin_exercises.media_quality(exercise),
            "workout_uses": workout_uses,
            "program_uses": program_uses,
            "is_archived": bool(exercise.is_deleted),
        }
    )


def _upload_error(exc: admin_exercise_media.ExerciseMediaUploadError) -> HTTPException:
    details = {
        "empty_image": "Файл изображения пуст",
        "image_too_large": "Файл превышает допустимый размер",
        "invalid_image": "Файл повреждён или не является изображением",
        "unsupported_image": "Для основного медиа подходят GIF, WebP, PNG и JPEG; для миниатюры — WebP, PNG и JPEG",
        "invalid_dimensions": "Размер изображения не должен превышать 4096×4096 пикселей",
        "too_many_frames": "В анимации должно быть не более 600 кадров",
        "idempotency_conflict": "Этот ключ загрузки уже использован для другого файла",
    }
    code = (
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        if str(exc) == "image_too_large"
        else status.HTTP_422_UNPROCESSABLE_ENTITY
    )
    if str(exc) == "unsupported_image":
        code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    if str(exc) == "idempotency_conflict":
        code = status.HTTP_409_CONFLICT
    return HTTPException(status_code=code, detail=details.get(str(exc), "Некорректный файл медиа"))


@router.get("/{exercise_id}", response_model=AdminExerciseItem)
async def get_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: None = Depends(require_system_admin),
) -> AdminExerciseItem:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        exercise = await exercise_service.get_archived_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")
    workout_uses, program_uses = await admin_exercises.usage_counts(session, exercise_id)
    return _item(exercise, workout_uses=workout_uses, program_uses=program_uses)


@router.post(
    "/{exercise_id}/media",
    response_model=ExerciseMediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_media(
    exercise_id: uuid.UUID,
    image: UploadFile = File(...),
    field: UploadMediaField = Form(...),
    idempotency_key: uuid.UUID = Form(...),
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> ExerciseMediaUploadResponse:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")
    try:
        media = await admin_exercise_media.read_upload(image, field)
        await admin_exercise_media.attach_media(
            session,
            exercise,
            field=field,
            idempotency_key=idempotency_key,
            media=media,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except admin_exercise_media.ExerciseMediaUploadError as exc:
        raise _upload_error(exc) from exc
    workout_uses, program_uses = await admin_exercises.usage_counts(session, exercise_id)
    return ExerciseMediaUploadResponse(
        url=str(getattr(exercise, field)),
        exercise=_item(exercise, workout_uses=workout_uses, program_uses=program_uses),
    )


@router.post("", response_model=AdminExerciseItem, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    body: ExerciseCreate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminExerciseItem:
    exercise = await exercise_service.create_exercise(
        session,
        body,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    return _item(exercise)


@router.put("/{exercise_id}", response_model=AdminExerciseItem)
async def update_exercise(
    exercise_id: uuid.UUID,
    body: ExerciseUpdate,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminExerciseItem:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")
    updated = await exercise_service.update_exercise(
        session,
        exercise,
        body,
        audit_context=admin_audit.AuditContext(admin.id, correlation_id),
    )
    workout_uses, program_uses = await admin_exercises.usage_counts(session, exercise_id)
    return _item(updated, workout_uses=workout_uses, program_uses=program_uses)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> None:
    exercise = await exercise_service.get_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")
    try:
        await exercise_service.soft_delete_exercise(
            session,
            exercise,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except exercise_service.ExerciseInUseError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Архивация заблокирована: тренировок — {exc.workout_uses}, "
                f"программ — {exc.program_uses}. Сначала выполните безопасную замену."
            ),
        ) from exc


@router.post("/{exercise_id}/restore", response_model=AdminExerciseItem)
async def restore_exercise(
    exercise_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    correlation_id: uuid.UUID = Depends(get_request_id),
) -> AdminExerciseItem:
    exercise = await exercise_service.get_archived_exercise(session, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Упражнение не найдено в архиве")
    try:
        restored = await exercise_service.restore_exercise(
            session,
            exercise,
            audit_context=admin_audit.AuditContext(admin.id, correlation_id),
        )
    except exercise_service.ExerciseRestoreConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="В активном каталоге уже есть упражнение с таким названием.",
        ) from exc
    workout_uses, program_uses = await admin_exercises.usage_counts(session, exercise_id)
    return _item(restored, workout_uses=workout_uses, program_uses=program_uses)
