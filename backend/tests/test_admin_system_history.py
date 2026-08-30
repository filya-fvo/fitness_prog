"""Sanitized persistence and retrieval for admin system history."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.models.admin_system_snapshot import AdminSystemSnapshot
from app.schemas.admin_system import AdminSystemCheck, AdminSystemStatusResponse
from app.services import admin_system_history


def _status(*, database: str = "normal") -> AdminSystemStatusResponse:
    checked_at = datetime.now(UTC)
    return AdminSystemStatusResponse(
        checked_at=checked_at,
        overall_status="normal" if database == "normal" else "error",
        items=[
            AdminSystemCheck(
                key="api",
                title="API",
                status="normal",
                summary="postgresql://secret-host/private",
                next_step="token=secret",
                observed_at=checked_at,
            ),
            AdminSystemCheck(
                key="database",
                title="PostgreSQL",
                status=database,  # type: ignore[arg-type]
                summary="Состояние базы",
                next_step="Проверить",
                observed_at=checked_at,
            ),
        ],
    )


class WriteSession:
    def __init__(self) -> None:
        self.added: list[AdminSystemSnapshot] = []
        self.statements: list[object] = []
        self.committed = False
        self.rolled_back = False

    def add(self, value: AdminSystemSnapshot) -> None:
        self.added.append(value)

    async def execute(self, statement):
        self.statements.append(statement)
        return SimpleNamespace()

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        self.rolled_back = True


@pytest.mark.asyncio
async def test_snapshot_persists_only_allowlisted_statuses() -> None:
    session = WriteSession()

    await admin_system_history.record_system_snapshot(  # type: ignore[arg-type]
        session,
        _status(),
        source="manual",
    )

    assert session.committed is True
    assert len(session.statements) == 1
    assert session.added[0].item_statuses == {"api": "normal", "database": "normal"}
    assert "secret" not in str(session.added[0].item_statuses)


@pytest.mark.asyncio
async def test_database_failure_is_returned_without_snapshot(monkeypatch) -> None:
    session = WriteSession()

    async def fake_collect(_session, _settings):
        return _status(database="error")

    monkeypatch.setattr(admin_system_history.admin_system, "collect_system_status", fake_collect)

    result, recorded = await admin_system_history.collect_and_record_system_status(
        session,  # type: ignore[arg-type]
        Settings(jwt_secret="test"),
        source="scheduled",
    )

    assert result.overall_status == "error"
    assert recorded is False
    assert session.added == []
    assert session.committed is False


@pytest.mark.asyncio
async def test_history_is_limited_and_invalid_stored_values_are_ignored() -> None:
    row = AdminSystemSnapshot(
        id=uuid.uuid4(),
        captured_at=datetime.now(UTC) - timedelta(minutes=15),
        overall_status="attention",
        item_statuses={"api": "normal", "database": "attention", "unknown": "error"},
        source="scheduled",
    )

    class ReadSession:
        async def execute(self, _statement):
            return SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: [row]),
            )

    result = await admin_system_history.list_system_history(  # type: ignore[arg-type]
        ReadSession(),
        limit=999,
    )

    assert result.retention_days == 30
    assert [item.key for item in result.snapshots[0].items] == ["api", "database"]
    assert result.snapshots[0].overall_status == "attention"
