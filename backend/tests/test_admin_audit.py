"""Security and contract tests for the immutable admin journal."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.request_id import parse_or_create_request_id
from app.core.security import create_access_token
from app.main import app
from app.models.exercise import Exercise
from app.models.user import User
from app.schemas.admin_audit import AdminAuditEntry, AdminAuditExportRequest
from app.schemas.exercise import ExerciseUpdate
from app.services import admin_audit, admin_audit_export, admin_users, exercise_service


class AddOnlySession:
    def __init__(self) -> None:
        self.added = []

    def add(self, value) -> None:
        self.added.append(value)


class MutationSession(AddOnlySession):
    def __init__(self) -> None:
        super().__init__()
        self.operations: list[str] = []

    def add(self, value) -> None:
        super().add(value)
        self.operations.append("add")

    async def flush(self) -> None:
        self.operations.append("flush")

    async def commit(self) -> None:
        self.operations.append("commit")

    async def refresh(self, _value) -> None:
        self.operations.append("refresh")


class AuthSession:
    def __init__(self, user) -> None:
        self.user = user

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)


class ListSession:
    def __init__(self, event, actor_id) -> None:
        self.event = event
        self.actor_id = actor_id
        self.execute_calls = 0
        self.scalar_statement = None

    async def scalar(self, statement):
        self.scalar_statement = statement
        return 1

    async def execute(self, _statement):
        self.execute_calls += 1
        rows = (
            [(self.event, "owner", None, "Жим лёжа", None, None)]
            if self.execute_calls == 1
            else [(self.actor_id, "owner")]
        )
        return SimpleNamespace(all=lambda: rows)

    async def scalars(self, _statement):
        return SimpleNamespace(all=lambda: ["exercise.update"])


def test_safe_snapshot_excludes_urls_text_and_unknown_secrets() -> None:
    exercise = Exercise(
        id=uuid.uuid4(),
        name_ru="Жим лёжа",
        muscle_group="грудь",
        equipment="штанга",
        description="Длинная инструкция",
        technique="Секретный текст",
        difficulty=3,
        video_url="https://example.test/video?token=secret",
        media_source="local",
        tags=["сила"],
        is_deleted=False,
    )
    snapshot = admin_audit.exercise_snapshot(exercise)

    assert snapshot["name"] == "Жим лёжа"
    assert "video_url" not in snapshot
    assert "description" not in snapshot
    assert "technique" not in snapshot

    session = AddOnlySession()
    admin_audit.add_event(  # type: ignore[arg-type]
        session,
        context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
        action="exercise.update",
        object_type="exercise",
        object_id=exercise.id,
        result="success",
        description="  Упражнение   изменено.  ",
        after={**snapshot, "token": "secret", "password": "secret"},
    )
    event = session.added[0]
    assert event.description == "Упражнение изменено."
    assert "token" not in event.after_data
    assert "password" not in event.after_data


def test_request_id_accepts_only_uuid() -> None:
    supplied = uuid.uuid4()
    assert parse_or_create_request_id(str(supplied)) == supplied
    assert parse_or_create_request_id("not-a-request-id") != supplied


def test_audit_search_accepts_telegram_username_with_at_sign() -> None:
    assert admin_audit._search_patterns("  @target  ") == ("%@target%", "%target%")


@pytest.mark.asyncio
async def test_exercise_change_and_audit_share_one_commit() -> None:
    session = MutationSession()
    exercise = Exercise(
        id=uuid.uuid4(),
        name_ru="Жим лёжа",
        muscle_group="грудь",
        difficulty=2,
        media_source="none",
        tags=[],
        is_deleted=False,
    )

    await exercise_service.update_exercise(  # type: ignore[arg-type]
        session,
        exercise,
        ExerciseUpdate(difficulty=3, video_url="https://example.test/?token=hidden"),
        audit_context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
    )

    assert session.operations == ["add", "commit", "refresh"]
    event = session.added[0]
    assert event.before_data["difficulty"] == 2
    assert event.after_data["difficulty"] == 3
    assert "video_url" not in event.after_data


@pytest.mark.asyncio
async def test_user_clear_and_audit_share_one_commit(monkeypatch) -> None:
    session = MutationSession()
    user = User(
        id=uuid.uuid4(),
        telegram_id=None,
        username="target",
        anthropometry={},
        goals={},
        subscription_status="free",
        is_deleted=False,
    )

    async def fake_delete(_session, _user_id):
        return {"workouts": 2, "workout_sets": 5}

    monkeypatch.setattr(admin_users, "_delete_workout_rows", fake_delete)
    result = await admin_users.clear_user_data(  # type: ignore[arg-type]
        session,
        user,
        scope="workouts",
        settings=Settings(jwt_secret="test"),
        notify=False,
        audit_context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
    )

    assert session.operations == ["add", "commit", "refresh"]
    assert session.added[0].action == "user.clear.workouts"
    assert session.added[0].after_data["stats"] == {"workouts": 2, "workout_sets": 5}
    assert result["notification_status"] == "not_requested"


def test_audit_api_is_read_only_and_migration_blocks_mutation() -> None:
    methods = app.openapi()["paths"]["/admin/audit"]
    assert set(methods) == {"get"}
    assert set(app.openapi()["paths"]["/admin/audit/export"]) == {"post"}

    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260826000023_admin_audit_log.sql"
    ).read_text(encoding="utf-8")
    assert "BEFORE UPDATE OR DELETE ON admin_audit_log" in migration
    assert "RAISE EXCEPTION 'admin_audit_log is append-only'" in migration


@pytest.mark.asyncio
async def test_list_events_maps_safe_rows_and_filter_options() -> None:
    actor_id = uuid.uuid4()
    event = SimpleNamespace(
        id=uuid.uuid4(),
        actor_user_id=actor_id,
        action="exercise.update",
        object_type="exercise",
        object_id=uuid.uuid4(),
        result="success",
        description="Упражнение изменено.",
        before_data={"difficulty": 2},
        after_data={"difficulty": 3},
        notification_status=None,
        correlation_id=uuid.uuid4(),
        created_at=datetime.now(UTC),
    )

    session = ListSession(event, actor_id)
    items, total, actors, actions = await admin_audit.list_events(  # type: ignore[arg-type]
        session,
        actor_user_id=actor_id,
        query="@owner",
        action="exercise.update",
        result="success",
        limit=30,
        offset=0,
    )

    assert total == 1
    assert items[0].actor_label == "@owner"
    assert items[0].object_label == "Жим лёжа"
    assert items[0].before == {"difficulty": 2}
    assert actors[0].id == actor_id
    assert actions == ["exercise.update"]
    compiled = str(session.scalar_statement)
    assert "exercises.name_ru" in compiled
    assert "programs.name" in compiled
    assert "admin_broadcasts.title" in compiled


@pytest.mark.asyncio
async def test_regular_user_cannot_read_audit_journal() -> None:
    regular_user = SimpleNamespace(id=uuid.uuid4(), telegram_id=42, username="reader")
    settings = Settings(admin_telegram_usernames="owner", jwt_secret="test")

    async def fake_db():
        yield AuthSession(regular_user)

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: settings
    token = create_access_token(
        subject=str(regular_user.id),
        telegram_id=regular_user.telegram_id,
        settings=settings,
    )
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            request_id = uuid.uuid4()
            response = await client.get(
                "/admin/audit",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Request-ID": str(request_id),
                },
            )
            export_response = await client.post(
                "/admin/audit/export?format=json",
                json={},
                headers={"Authorization": f"Bearer {token}"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.headers["X-Request-ID"] == str(request_id)
    assert response.json() == {"detail": "Требуются права администратора"}
    assert export_response.status_code == 403


def _export_entry(*, actor_label: str = "@owner") -> AdminAuditEntry:
    event_id = uuid.uuid4()
    return AdminAuditEntry(
        id=event_id,
        actor_user_id=uuid.uuid4(),
        actor_label=actor_label,
        action="exercise.update",
        object_type="exercise",
        object_id=uuid.uuid4(),
        result="success",
        description="Упражнение изменено.",
        before={"difficulty": 2},
        after={"difficulty": 3},
        notification_status=None,
        correlation_id=uuid.uuid4(),
        created_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_json_export_is_bounded_and_records_audit_event(monkeypatch) -> None:
    session = MutationSession()
    filters = AdminAuditExportRequest(query="жим", action="exercise.update", result="success")

    async def fake_query(_session, **kwargs):
        assert kwargs["limit"] == admin_audit_export.AUDIT_EXPORT_MAX_ROWS
        assert kwargs["max_limit"] == admin_audit_export.AUDIT_EXPORT_MAX_ROWS
        assert kwargs["action"] == "exercise.update"
        assert kwargs["query"] == "жим"
        return [_export_entry()], 1500

    monkeypatch.setattr(admin_audit, "query_event_page", fake_query)
    artifact = await admin_audit_export.prepare_audit_export(  # type: ignore[arg-type]
        session,
        filters,
        export_format="json",
        context=admin_audit.AuditContext(uuid.uuid4(), uuid.uuid4()),
    )

    payload = json.loads(artifact.content)
    assert payload["max_rows"] == 1000
    assert payload["exported_count"] == 1
    assert payload["total_matches"] == 1500
    assert payload["truncated"] is True
    assert session.operations == ["add", "commit"]
    assert session.added[0].action == "audit.export"
    assert session.added[0].after_data == {
        "format": "json",
        "exported_count": 1,
        "total_matches": 1500,
        "truncated": True,
    }


def test_csv_export_has_bom_headers_and_blocks_spreadsheet_formulas() -> None:
    content = admin_audit_export._csv_content([_export_entry(actor_label="=HYPERLINK(x)")])
    decoded = content.decode("utf-8")

    assert decoded.startswith("\ufeffid,created_at,actor_user_id")
    assert "'=HYPERLINK(x)" in decoded
    assert '"{""difficulty"":2}"' in decoded


@pytest.mark.asyncio
async def test_admin_export_route_returns_download_headers(monkeypatch) -> None:
    admin = SimpleNamespace(id=uuid.uuid4(), telegram_id=42, username="owner")
    settings = Settings(admin_telegram_usernames="owner", jwt_secret="test")
    captured: dict[str, object] = {}

    async def fake_db():
        yield AuthSession(admin)

    async def fake_prepare(_session, body, *, export_format, context):
        captured.update(body=body, export_format=export_format, context=context)
        return admin_audit_export.AuditExportArtifact(
            content=b"{}",
            media_type="application/json; charset=utf-8",
            filename="fitness-admin-audit-20260830-120000.json",
            exported_count=2,
            total_matches=3,
        )

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: settings
    monkeypatch.setattr(admin_audit_export, "prepare_audit_export", fake_prepare)
    token = create_access_token(
        subject=str(admin.id),
        telegram_id=admin.telegram_id,
        settings=settings,
    )
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/admin/audit/export?format=json",
                json={"query": "жим", "action": "exercise.update", "result": "success"},
                headers={"Authorization": f"Bearer {token}"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-disposition"].endswith('.json"')
    assert response.headers["x-exported-count"] == "2"
    assert response.headers["x-total-count"] == "3"
    assert response.headers["x-export-truncated"] == "true"
    assert captured["export_format"] == "json"
    assert captured["body"].action == "exercise.update"  # type: ignore[union-attr]
    assert captured["body"].query == "жим"  # type: ignore[union-attr]
