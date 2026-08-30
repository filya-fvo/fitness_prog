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
from app.routers import admin_exercises as admin_exercises_router
from app.models.exercise import Exercise
from app.schemas.admin_exercise import (
    ExerciseDuplicateCandidate,
    ExerciseMediaCheckRequest,
    ExercisePreflightRequest,
)
from app.schemas.exercise import ExerciseCreate, ExerciseResponse
from app.services import admin_audit, admin_exercise_import, admin_exercises, exercise_service


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
    result = await admin_exercise_import.preview_import(
        session,  # type: ignore[arg-type]
        [
            {"name_ru": "Планка", "muscle_group": "кор"},
            {"name_ru": "Планка", "muscle_group": "кор"},
            {"name_ru": "   ", "muscle_group": "кор"},
        ],
    )
    assert (result.total, result.valid, result.invalid) == (3, 1, 2)
    assert len(result.fingerprint) == 64
    assert "внутри файла" in result.rows[1].errors[0]
    assert session.calls == 1


@pytest.mark.asyncio
async def test_confirmed_import_is_atomic_and_adds_one_safe_summary_audit() -> None:
    class ImportSession:
        added_exercises: list[Exercise]
        audit_events: list[object]
        commits = 0
        rollbacks = 0

        def __init__(self) -> None:
            self.added_exercises = []
            self.audit_events = []

        async def execute(self, _statement):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

        def add_all(self, values):
            self.added_exercises = list(values)

        def add(self, value):
            self.audit_events.append(value)

        async def flush(self):
            for item in self.added_exercises:
                if item.id is None:
                    item.id = uuid.uuid4()

        async def commit(self):
            self.commits += 1

        async def rollback(self):
            self.rollbacks += 1

    items = [
        {"name_ru": "Планка", "muscle_group": "кор"},
        {"name_ru": "Лодочка", "muscle_group": "спина"},
    ]
    fingerprint = admin_exercise_import.import_fingerprint(items)
    session = ImportSession()
    result = await admin_exercise_import.apply_import(
        session,  # type: ignore[arg-type]
        items,
        fingerprint=fingerprint,
        confirmed=True,
        audit_context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
    )
    assert result.imported == 2
    assert session.commits == 1
    assert session.rollbacks == 0
    assert len(session.added_exercises) == 2
    assert len(session.audit_events) == 1
    event = session.audit_events[0]
    assert event.object_type == "exercise_import"
    assert event.after_data == {"imported_count": 2, "source": "json"}


@pytest.mark.asyncio
async def test_import_rejects_package_changed_after_preview_without_writes() -> None:
    session = SimpleNamespace()
    with pytest.raises(admin_exercise_import.ExerciseImportError):
        await admin_exercise_import.apply_import(
            session,  # type: ignore[arg-type]
            [{"name_ru": "Планка", "muscle_group": "кор"}],
            fingerprint="0" * 64,
            confirmed=True,
            audit_context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
        )


@pytest.mark.asyncio
async def test_archived_exercise_restores_only_without_active_exact_duplicate(monkeypatch) -> None:
    class RestoreSession:
        commits = 0
        refreshed = 0
        events: list[object]

        def __init__(self) -> None:
            self.events = []

        def add(self, value):
            self.events.append(value)

        async def commit(self):
            self.commits += 1

        async def refresh(self, _value):
            self.refreshed += 1

    async def no_duplicates(_session, _name, *, exclude_id=None):
        assert exclude_id is None
        return []

    monkeypatch.setattr(admin_exercises, "find_duplicates", no_duplicates)
    item = exercise(is_deleted=True)
    session = RestoreSession()
    restored = await exercise_service.restore_exercise(
        session,  # type: ignore[arg-type]
        item,
        audit_context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
    )
    assert restored.is_deleted is False
    assert session.commits == 1
    assert session.refreshed == 1
    assert session.events[0].action == "exercise.restore"


def test_media_response_does_not_echo_transport_exception() -> None:
    request = httpx.Request("HEAD", "https://example.test/a.gif")
    error = httpx.ConnectError("token=secret", request=request)
    assert "secret" not in "Не удалось проверить доступность медиа."
    assert isinstance(error, httpx.HTTPError)


@pytest.mark.asyncio
async def test_admin_can_open_exact_archived_exercise_from_audit(monkeypatch) -> None:
    item = exercise(is_deleted=True)

    async def no_active(_session, _exercise_id):
        return None

    async def archived(_session, exercise_id):
        assert exercise_id == item.id
        return item

    async def unused(_session, _exercise_id):
        return 0, 0

    monkeypatch.setattr(exercise_service, "get_exercise", no_active)
    monkeypatch.setattr(exercise_service, "get_archived_exercise", archived)
    monkeypatch.setattr(admin_exercises, "usage_counts", unused)
    result = await admin_exercises_router.get_exercise(item.id, SimpleNamespace())  # type: ignore[arg-type]

    assert result.id == item.id
    assert result.is_archived is True


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
            detail_response = await client.get(
                f"/admin/exercises/{uuid.uuid4()}",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert response.status_code == 403
        assert detail_response.status_code == 403
    finally:
        app.dependency_overrides.clear()
