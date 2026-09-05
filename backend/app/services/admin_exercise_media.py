"""Validated PostgreSQL-backed uploads for exercise images and animations."""

from __future__ import annotations

import hashlib
import uuid
import warnings
from dataclasses import dataclass
from io import BytesIO
from typing import Literal

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.exercise_media import ExerciseMediaAsset
from app.services import admin_audit

UploadField = Literal["animation_url", "thumbnail_url"]

MAX_UPLOAD_BYTES = {
    "animation_url": 25 * 1024 * 1024,
    "thumbnail_url": 5 * 1024 * 1024,
}
ALLOWED_MIME_TYPES = {
    "animation_url": {"image/gif", "image/webp", "image/png", "image/jpeg"},
    "thumbnail_url": {"image/webp", "image/png", "image/jpeg"},
}
MAX_IMAGE_SIDE = 4096
MAX_IMAGE_PIXELS = 16_000_000
MAX_ANIMATION_FRAMES = 600

_FORMAT_MIME = {
    "GIF": "image/gif",
    "WEBP": "image/webp",
    "PNG": "image/png",
    "JPEG": "image/jpeg",
}


class ExerciseMediaUploadError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ValidatedExerciseMedia:
    data: bytes
    mime_type: str
    width: int
    height: int
    frame_count: int
    sha256: str


def _inspect_image(data: bytes) -> tuple[str, int, int, int]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                mime_type = _FORMAT_MIME.get((image.format or "").upper())
                width, height = image.size
                frame_count = int(getattr(image, "n_frames", 1))
                image.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ExerciseMediaUploadError("image_too_large") from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise ExerciseMediaUploadError("invalid_image") from None
    if mime_type is None:
        raise ExerciseMediaUploadError("unsupported_image")
    if (
        width < 1
        or height < 1
        or width > MAX_IMAGE_SIDE
        or height > MAX_IMAGE_SIDE
        or width * height > MAX_IMAGE_PIXELS
    ):
        raise ExerciseMediaUploadError("invalid_dimensions")
    if frame_count < 1 or frame_count > MAX_ANIMATION_FRAMES:
        raise ExerciseMediaUploadError("too_many_frames")
    return mime_type, width, height, frame_count


async def read_upload(upload, field: UploadField) -> ValidatedExerciseMedia:
    limit = MAX_UPLOAD_BYTES[field]
    data = await upload.read(limit + 1)
    if not data:
        raise ExerciseMediaUploadError("empty_image")
    if len(data) > limit:
        raise ExerciseMediaUploadError("image_too_large")
    mime_type, width, height, frame_count = _inspect_image(data)
    declared = str(getattr(upload, "content_type", "") or "").split(";", 1)[0].lower()
    if mime_type not in ALLOWED_MIME_TYPES[field] or (
        declared and declared not in {mime_type, "application/octet-stream"}
    ):
        raise ExerciseMediaUploadError("unsupported_image")
    return ValidatedExerciseMedia(
        data=data,
        mime_type=mime_type,
        width=width,
        height=height,
        frame_count=frame_count,
        sha256=hashlib.sha256(data).hexdigest(),
    )


async def attach_media(
    session: AsyncSession,
    exercise: Exercise,
    *,
    field: UploadField,
    idempotency_key: uuid.UUID,
    media: ValidatedExerciseMedia,
    audit_context: admin_audit.AuditContext,
) -> ExerciseMediaAsset:
    exercise_id = exercise.id
    existing = await session.scalar(
        select(ExerciseMediaAsset).where(
            ExerciseMediaAsset.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.exercise_id != exercise_id or existing.field != field:
            raise ExerciseMediaUploadError("idempotency_conflict")
        return existing

    asset = ExerciseMediaAsset(
        exercise_id=exercise_id,
        idempotency_key=idempotency_key,
        field=field,
        mime_type=media.mime_type,
        size_bytes=len(media.data),
        width=media.width,
        height=media.height,
        frame_count=media.frame_count,
        sha256=media.sha256,
        media_data=media.data,
    )
    session.add(asset)
    await session.flush()
    setattr(exercise, field, f"/exercise-media/{asset.id}")
    exercise.media_source = "none"
    label = "основное медиа" if field == "animation_url" else "миниатюра"
    admin_audit.add_event(
        session,
        context=audit_context,
        action="exercise.media_upload",
        object_type="exercise",
        object_id=exercise_id,
        result="success",
        description=f"Загружено {label} упражнения ({media.mime_type}, {len(media.data)} байт).",
        after=admin_audit.exercise_snapshot(exercise),
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(ExerciseMediaAsset).where(ExerciseMediaAsset.idempotency_key == idempotency_key)
        )
        if existing is None:
            raise
        if existing.exercise_id != exercise_id or existing.field != field:
            raise ExerciseMediaUploadError("idempotency_conflict") from None
        await session.refresh(exercise)
        return existing
    await session.refresh(asset)
    await session.refresh(exercise)
    return asset


async def get_asset(
    session: AsyncSession,
    asset_id: uuid.UUID,
) -> ExerciseMediaAsset | None:
    return await session.scalar(select(ExerciseMediaAsset).where(ExerciseMediaAsset.id == asset_id))
