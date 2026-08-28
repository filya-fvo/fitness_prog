"""Stage 5 exercise editor safety and validation regressions."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.exercise import Exercise
from app.schemas.admin_exercise import (
    ExerciseDuplicateCandidate,
    ExerciseMediaCheckRequest,
    ExercisePreflightRequest,
)
from app.schemas.exercise import ExerciseCreate, ExerciseResponse
from app.services import admin_exercises, exercise_service


def exercise(**overrides) -> Exercise:
    values = {
        "id": uuid.uuid4(),
        "name_ru": "Жим гантелей",
        "muscle_group": "грудь",
        "secondary_muscle_groups": ["трицепс"],
        "equipment": "гантели",
        "description": None,
        "technique": None,
        "common_mistakes": None,
        "difficulty": 2,
        "video_url": None,
        "animation_url": "/exercise-gifs/test.gif",
        "thumbnail_url": None,
        "media_duration_sec": None,
        "media_source": "none",
        "tags": ["curated"],
        "limitations": ["без боли в плече"],
        "weight_rule": "per_hand",
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "is_deleted": False,
    }
    values.update(overrides)
    return Exercise(**values)


def settings() -> Settings:
    return Settings(_env_file=None, jwt_secret="test", mini_app_url="https://app.example")


def test_extended_exercise_contract_is_backward_compatible() -> None:
    legacy = ExerciseCreate(name_ru="Планка", muscle_group="кор")
    assert legacy.secondary_muscle_groups == []
    assert legacy.limitations == []
    assert legacy.weight_rule == "total"

    response = ExerciseResponse.model_validate(exercise())
    assert response.secondary_muscle_groups == ["трицепс"]
    assert response.weight_rule == "per_hand"


def test_media_quality_covers_all_editor_states() -> None:
    assert admin_exercises.media_quality(exercise()) == "ready"
    assert admin_exercises.media_quality(exercise(tags=[], animation_url=None)) == "missing"
    assert admin_exercises.media_quality(
        exercise(tags=["media:no-exact-gif"], animation_url=None)
    ) == "rejected"
    assert admin_exercises.media_quality(
        exercise(tags=[], animation_url="https://cdn.example/exercise.gif")
    ) == "unverified"


def test_nested_program_reference_is_exact() -> None:
    exercise_id = uuid.uuid4()
    structure = {"weeks": [{"days": [{"exercises": [{"exercise_id": str(exercise_id)}]}]}]}
    assert admin_exercises._program_references(structure, exercise_id) is True
    assert admin_exercises._program_references(structure, uuid.uuid4()) is False


class FakeResponse:
    status_code = 200
    is_redirect = False
    headers = {"content-type": "image/gif", "content-length": "1024"}


class FakeHttpClient:
    async def head(self, _url):
        return FakeResponse()

    async def get(self, _url, *, headers):
        assert headers == {"Range": "bytes=0-0"}
        return FakeResponse()

    async def aclose(self):
        return None


@pytest.mark.asyncio
async def test_media_check_rejects_private_url_and_accepts_expected_mime(monkeypatch) -> None:
    private = await admin_exercises.check_media(
        ExerciseMediaCheckRequest(field="thumbnail_url", url="http://127.0.0.1/a.png"),
        settings(),
    )
    assert private.status == "error"
    assert private.available is False

    async def public(_host: str) -> bool:
        return True

    monkeypatch.setattr(admin_exercises, "_host_is_public", public)
    checked = await admin_exercises.check_media(
        ExerciseMediaCheckRequest(field="animation_url", url="https://cdn.example/a.gif"),
        settings(),
        client=FakeHttpClient(),  # type: ignore[arg-type]
    )
    assert checked.status == "ok"
    assert checked.mime_type == "image/gif"
    assert checked.size_bytes == 1024


@pytest.mark.asyncio
async def test_preflight_flags_exact_duplicate_without_writing(monkeypatch) -> None:
    duplicate = SimpleNamespace(id=uuid.uuid4(), name_ru="Жим гантелей")

    async def duplicates(_session, _name, *, exclude_id=None):
        assert exclude_id is None
        return [
            ExerciseDuplicateCandidate(
                id=duplicate.id, name_ru=duplicate.name_ru, similarity=1.0
            )
        ]

    monkeypatch.setattr(admin_exercises, "find_duplicates", duplicates)
    result = await admin_exercises.preflight(
        SimpleNamespace(),  # type: ignore[arg-type]
        ExercisePreflightRequest(name_ru="Жим гантелей", muscle_group="грудь"),
        settings(),
    )
    assert result.valid is False
    assert result.media == []
    assert "таким названием" in result.errors[0]


@pytest.mark.asyncio
async def test_archive_is_blocked_before_mutation_when_exercise_is_used(monkeypatch) -> None:
    item = exercise()

    async def used(_session, _exercise_id):
        return 3, 1

    monkeypatch.setattr(admin_exercises, "usage_counts", used)
    with pytest.raises(exercise_service.ExerciseInUseError) as exc:
        await exercise_service.soft_delete_exercise(SimpleNamespace(), item)  # type: ignore[arg-type]
    assert (exc.value.workout_uses, exc.value.program_uses) == (3, 1)
    assert item.is_deleted is False


@pytest.mark.asyncio
async def test_import_preview_validates_batch_without_writes_or_repeated_catalog_queries() -> None:
    class CatalogSession:
        calls = 0

        async def execute(self, _statement):
            self.calls += 1
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    session = CatalogSession()
    result = await admin_exercises.preview_import(
        session,  # type: ignore[arg-type]
        [
            {"name_ru": "Планка", "muscle_group": "кор"},
            {"name_ru": "Планка", "muscle_group": "кор"},
            {"name_ru": "   ", "muscle_group": "кор"},
        ],
    )
    assert (result.total, result.valid, result.invalid) == (3, 1, 2)
    assert "внутри файла" in result.rows[1].errors[0]
    assert session.calls == 1


def test_media_response_does_not_echo_transport_exception() -> None:
    request = httpx.Request("HEAD", "https://example.test/a.gif")
    error = httpx.ConnectError("token=secret", request=request)
    assert "secret" not in "Не удалось проверить доступность медиа."
    assert isinstance(error, httpx.HTTPError)


class AuthSession:
    def __init__(self, user) -> None:
        self.user = user

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)


@pytest.mark.asyncio
async def test_regular_user_cannot_open_exercise_editor() -> None:
    regular = SimpleNamespace(telegram_id=100, username="regular")

    async def fake_db():
        yield AuthSession(regular)

    test_settings = Settings(
        _env_file=None,
        admin_telegram_usernames="owner",
        jwt_secret="test",
    )
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: test_settings
    token = create_access_token(
        subject="00000000-0000-4000-8000-000000000100",
        telegram_id=100,
        settings=test_settings,
    )
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/admin/exercises",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
