"""Admin system dashboard states and access control."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.schemas.admin_system import AdminSystemCheck, AdminSystemStatusResponse
from app.services import admin_system


class FakeSession:
    def __init__(self, error: Exception | None = None, user=None) -> None:
        self.error = error
        self.user = user

    async def execute(self, _statement):
        if self.error is not None:
            raise self.error
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)


class FakeRedis:
    def __init__(self, values=None, *, error: Exception | None = None, queue_length=0) -> None:
        self.values = values or {}
        self.error = error
        self.queue_length = queue_length
        self.closed = False

    async def ping(self):
        if self.error is not None:
            raise self.error
        return True

    async def zcard(self, _key):
        return self.queue_length

    async def get(self, key):
        return self.values.get(key)

    async def aclose(self):
        self.closed = True


@pytest.mark.asyncio
async def test_database_probe_has_independent_normal_and_error_states() -> None:
    checked_at = datetime.now(UTC)
    normal = await admin_system.probe_database(FakeSession(), checked_at)  # type: ignore[arg-type]
    failed = await admin_system.probe_database(  # type: ignore[arg-type]
        FakeSession(RuntimeError("postgresql://secret-host/private")),
        checked_at,
    )

    assert normal.status == "normal"
    assert failed.status == "error"
    assert "secret-host" not in failed.model_dump_json()


@pytest.mark.asyncio
async def test_redis_failure_does_not_hide_worker_and_queue_states(monkeypatch) -> None:
    fake = FakeRedis(error=ConnectionError("redis://password@host"))
    monkeypatch.setattr("redis.asyncio.Redis.from_url", lambda *_args, **_kwargs: fake)

    result = await admin_system.probe_redis(
        Settings(redis_url="redis://password@host", jwt_secret="test"),
        datetime.now(UTC),
    )

    assert [item.key for item in result] == ["redis", "worker", "notifications", "queue"]
    assert [item.status for item in result] == ["error", "no_data", "no_data", "no_data"]
    assert "password" not in json.dumps([item.model_dump(mode="json") for item in result])
    assert fake.closed is True


@pytest.mark.asyncio
async def test_redis_reports_queue_worker_and_notification_attention(monkeypatch) -> None:
    now = datetime.now(UTC)
    fake = FakeRedis(
        queue_length=51,
        values={
            admin_system.WORKER_STATUS_KEY: json.dumps(
                {"recorded_at": now.isoformat(), "task": "Проверка", "state": "completed"}
            ),
            admin_system.NOTIFICATION_STATUS_KEY: json.dumps(
                {"recorded_at": now.isoformat(), "processed": 10, "sent": 3, "errors": 1}
            ),
        },
    )
    monkeypatch.setattr("redis.asyncio.Redis.from_url", lambda *_args, **_kwargs: fake)

    result = await admin_system.probe_redis(Settings(jwt_secret="test"), now)
    by_key = {item.key: item for item in result}

    assert by_key["redis"].status == "normal"
    assert by_key["worker"].status == "normal"
    assert by_key["notifications"].status == "attention"
    assert by_key["queue"].status == "attention"


def test_worker_heartbeat_has_attention_error_and_no_data_states() -> None:
    now = datetime.now(UTC)
    delayed = admin_system._worker_check(
        {"recorded_at": (now - timedelta(seconds=180)).isoformat(), "state": "running"},
        now,
    )
    stale = admin_system._worker_check(
        {"recorded_at": (now - timedelta(minutes=10)).isoformat(), "state": "running"},
        now,
    )
    failed = admin_system._worker_check(
        {"recorded_at": now.isoformat(), "state": "failed"},
        now,
    )
    missing = admin_system._worker_check(None, now)

    assert delayed.status == "attention"
    assert stale.status == "error"
    assert failed.status == "error"
    assert missing.status == "no_data"


def test_host_status_files_are_allowlisted_and_age_backup(tmp_path) -> None:
    now = datetime.now(UTC)
    (tmp_path / "backup.json").write_text(
        json.dumps(
            {
                "status": "ok",
                "completed_at": (now - timedelta(hours=40)).isoformat(),
                "database_url": "postgresql://secret",
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "deployment.json").write_text(
        json.dumps(
            {
                "version": "0.20.26",
                "commit": "a" * 40,
                "deployed_at": now.isoformat(),
                "token": "secret-token",
            }
        ),
        encoding="utf-8",
    )
    settings = Settings(admin_system_status_dir=str(tmp_path), jwt_secret="test")

    backup = admin_system.backup_check(settings, now)
    deployment = admin_system.deployment_check(settings)
    rendered = backup.model_dump_json() + deployment.model_dump_json()

    assert backup.status == "attention"
    assert deployment.status == "normal"
    assert "postgresql" not in rendered
    assert "secret-token" not in rendered


def test_https_status_covers_normal_attention_error_and_no_data(tmp_path) -> None:
    now = datetime.now(UTC)
    settings = Settings(admin_system_status_dir=str(tmp_path), jwt_secret="test")

    assert admin_system.https_check(settings, now).status == "no_data"
    for delta, expected in [
        (timedelta(days=30), "normal"),
        (timedelta(days=5), "attention"),
        (timedelta(days=-1), "error"),
    ]:
        (tmp_path / "https.json").write_text(
            json.dumps({"expires_at": (now + delta).isoformat()}),
            encoding="utf-8",
        )
        assert admin_system.https_check(settings, now).status == expected


def test_failed_backup_status_is_reported_without_host_details(tmp_path) -> None:
    now = datetime.now(UTC)
    (tmp_path / "backup.json").write_text(
        json.dumps(
            {
                "status": "error",
                "recorded_at": now.isoformat(),
                "detail": "pg_dump password=secret",
            }
        ),
        encoding="utf-8",
    )
    check = admin_system.backup_check(
        Settings(admin_system_status_dir=str(tmp_path), jwt_secret="test"),
        now,
    )

    assert check.status == "error"
    assert "secret" not in check.model_dump_json()


@pytest.mark.asyncio
async def test_overall_status_uses_worst_independent_check(monkeypatch) -> None:
    async def fake_database(_session, checked_at):
        return AdminSystemCheck(
            key="database",
            title="PostgreSQL",
            status="error",
            summary="Ошибка",
            next_step="Проверить",
            observed_at=checked_at,
        )

    async def fake_redis(_settings, checked_at):
        return [
            AdminSystemCheck(
                key="redis",
                title="Redis",
                status="normal",
                summary="Норма",
                next_step="Нет",
                observed_at=checked_at,
            )
        ]

    monkeypatch.setattr(admin_system, "probe_database", fake_database)
    monkeypatch.setattr(admin_system, "probe_redis", fake_redis)

    result = await admin_system.collect_system_status(
        FakeSession(),  # type: ignore[arg-type]
        Settings(jwt_secret="test"),
    )

    assert result.overall_status == "error"
    assert {item.key for item in result.items} >= {"api", "database", "redis"}


@pytest.mark.asyncio
async def test_regular_user_cannot_read_system_status() -> None:
    regular_user = SimpleNamespace(telegram_id=100, username="regular")

    async def fake_db():
        yield FakeSession(user=regular_user)

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: Settings(
        admin_telegram_usernames="owner",
        jwt_secret="test",
    )
    token = create_access_token(
        subject="00000000-0000-4000-8000-000000000100",
        telegram_id=100,
        settings=Settings(jwt_secret="test"),
    )
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/admin/system/status",
                headers={"Authorization": f"Bearer {token}"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {"detail": "Требуются права администратора"}


@pytest.mark.asyncio
async def test_numeric_admin_can_read_database_error_without_auth_db_lookup(monkeypatch) -> None:
    async def fake_db():
        yield FakeSession(RuntimeError("database unavailable"))

    async def fake_collect(_session, _settings):
        checked_at = datetime.now(UTC)
        return AdminSystemStatusResponse(
            checked_at=checked_at,
            overall_status="error",
            items=[
                AdminSystemCheck(
                    key="database",
                    title="PostgreSQL",
                    status="error",
                    summary="База данных не ответила на безопасную проверку.",
                    next_step="Проверьте контейнер db.",
                    observed_at=checked_at,
                )
            ],
        )

    settings = Settings(admin_telegram_ids="42", jwt_secret="test")
    token = create_access_token(
        subject="00000000-0000-4000-8000-000000000042",
        telegram_id=42,
        settings=settings,
    )
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_settings] = lambda: settings
    monkeypatch.setattr(admin_system, "collect_system_status", fake_collect)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/admin/system/status",
                headers={"Authorization": f"Bearer {token}"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["items"][0]["status"] == "error"
