"""Controlled exercise media upload and delivery regressions."""

from __future__ import annotations

import uuid
from io import BytesIO
from types import SimpleNamespace

import httpx
import pytest
from PIL import Image

from app.core.config import Settings
from app.core.database import get_db
from app.main import app
from app.models.admin_audit_log import AdminAuditLog
from app.models.exercise import Exercise
from app.models.exercise_media import ExerciseMediaAsset
from app.schemas.admin_exercise import ExerciseMediaCheckRequest
from app.services import admin_audit, admin_exercise_media, admin_exercises


class Upload:
    def __init__(self, data: bytes, content_type: str) -> None:
        self.data = data
        self.content_type = content_type

    async def read(self, limit: int) -> bytes:
        return self.data[:limit]


def image_bytes(image_format: str, *, size: tuple[int, int] = (16, 12)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, color="blue").save(output, format=image_format)
    return output.getvalue()


def exercise() -> Exercise:
    return Exercise(
        id=uuid.uuid4(),
        name_ru="Планка",
        muscle_group="кор",
        secondary_muscle_groups=[],
        equipment=None,
        description=None,
        technique=None,
        common_mistakes=None,
        difficulty=1,
        video_url=None,
        animation_url=None,
        thumbnail_url=None,
        media_duration_sec=None,
        media_source="none",
        tags=[],
        limitations=[],
        weight_rule="none",
        is_deleted=False,
    )


@pytest.mark.asyncio
async def test_upload_uses_detected_image_type_and_field_limits() -> None:
    png = image_bytes("PNG")
    media = await admin_exercise_media.read_upload(Upload(png, "image/png"), "animation_url")
    assert (media.mime_type, media.width, media.height, media.frame_count) == (
        "image/png",
        16,
        12,
        1,
    )
    assert len(media.sha256) == 64

    gif = image_bytes("GIF")
    with pytest.raises(admin_exercise_media.ExerciseMediaUploadError, match="unsupported_image"):
        await admin_exercise_media.read_upload(Upload(gif, "image/gif"), "thumbnail_url")

    with pytest.raises(admin_exercise_media.ExerciseMediaUploadError, match="unsupported_image"):
        await admin_exercise_media.read_upload(Upload(png, "image/jpeg"), "animation_url")


@pytest.mark.asyncio
async def test_upload_rejects_empty_corrupt_and_oversized_files() -> None:
    with pytest.raises(admin_exercise_media.ExerciseMediaUploadError, match="empty_image"):
        await admin_exercise_media.read_upload(Upload(b"", "image/png"), "thumbnail_url")
    with pytest.raises(admin_exercise_media.ExerciseMediaUploadError, match="invalid_image"):
        await admin_exercise_media.read_upload(
            Upload(b"not-an-image", "image/png"), "thumbnail_url"
        )
    oversized = b"0" * (admin_exercise_media.MAX_UPLOAD_BYTES["thumbnail_url"] + 1)
    with pytest.raises(admin_exercise_media.ExerciseMediaUploadError, match="image_too_large"):
        await admin_exercise_media.read_upload(
            Upload(oversized, "application/octet-stream"), "thumbnail_url"
        )


@pytest.mark.asyncio
async def test_preflight_verifies_uploaded_asset_in_database_without_http() -> None:
    asset_id = uuid.uuid4()
    asset = SimpleNamespace(
        id=asset_id,
        field="animation_url",
        mime_type="image/webp",
        size_bytes=1234,
    )

    class StoredSession:
        async def scalar(self, _statement):
            return asset

    result = await admin_exercises.check_media(
        ExerciseMediaCheckRequest(field="animation_url", url=f"/exercise-media/{asset_id}"),
        Settings(_env_file=None),
        session=StoredSession(),  # type: ignore[arg-type]
    )
    assert result.status == "ok"
    assert result.size_bytes == 1234


class AttachSession:
    def __init__(self) -> None:
        self.values: list[object] = []
        self.commits = 0

    async def scalar(self, _statement):
        return None

    def add(self, value: object) -> None:
        self.values.append(value)

    async def flush(self) -> None:
        for value in self.values:
            if isinstance(value, ExerciseMediaAsset) and value.id is None:
                value.id = uuid.uuid4()

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _value: object) -> None:
        return None


@pytest.mark.asyncio
async def test_attaching_media_updates_exercise_atomically_and_adds_safe_audit() -> None:
    item = exercise()
    png = image_bytes("PNG")
    media = await admin_exercise_media.read_upload(Upload(png, "image/png"), "animation_url")
    session = AttachSession()
    asset = await admin_exercise_media.attach_media(
        session,  # type: ignore[arg-type]
        item,
        field="animation_url",
        idempotency_key=uuid.uuid4(),
        media=media,
        audit_context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
    )

    assert item.animation_url == f"/exercise-media/{asset.id}"
    assert session.commits == 1
    events = [value for value in session.values if isinstance(value, AdminAuditLog)]
    assert len(events) == 1
    assert events[0].action == "exercise.media_upload"
    assert "image/png" in events[0].description
    assert events[0].after_data["name"] == "Планка"
    assert "animation_url" not in events[0].after_data
    assert "sha256" not in events[0].after_data


@pytest.mark.asyncio
async def test_public_media_delivery_is_cacheable_and_does_not_require_auth(monkeypatch) -> None:
    asset_id = uuid.uuid4()
    data = image_bytes("PNG")
    asset = SimpleNamespace(
        id=asset_id,
        media_data=data,
        mime_type="image/png",
        size_bytes=len(data),
        sha256="a" * 64,
    )

    async def get_asset(_session, requested_id):
        assert requested_id == asset_id
        return asset

    async def fake_db():
        yield SimpleNamespace()

    monkeypatch.setattr(admin_exercise_media, "get_asset", get_asset)
    app.dependency_overrides[get_db] = fake_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/exercise-media/{asset_id}")
            not_modified = await client.get(
                f"/exercise-media/{asset_id}", headers={"If-None-Match": '"' + "a" * 64 + '"'}
            )
            head = await client.head(f"/exercise-media/{asset_id}")
        assert response.status_code == 200
        assert response.content == data
        assert response.headers["cache-control"].endswith("immutable")
        assert response.headers["x-content-type-options"] == "nosniff"
        assert not_modified.status_code == 304
        assert head.status_code == 200
        assert head.content == b""
        assert int(head.headers["content-length"]) == len(data)
    finally:
        app.dependency_overrides.clear()


def test_media_migration_keeps_binary_in_database_and_enforces_limits() -> None:
    migration = (
        __import__("pathlib").Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260905000039_exercise_media_assets.sql"
    ).read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS exercise_media_assets" in migration
    assert "media_data BYTEA NOT NULL" in migration
    assert "size_bytes = octet_length(media_data)" in migration
    assert "field <> 'thumbnail_url' OR size_bytes <= 5242880" in migration
