"""Regression tests for safe program drafts and publication visibility."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.routers import programs as programs_router
from app.schemas.program import ProgramUpdate
from app.services import program_publication, program_service


def program(**overrides) -> Program:
    values = {
        "id": uuid.uuid4(),
        "name": "Безопасная программа",
        "description": None,
        "target_level": "beginner",
        "duration_weeks": 4,
        "structure": {},
        "workout_type": "full_body",
        "level": "beginner",
        "is_template": True,
        "publication_status": "draft",
        "program_key": "test-program",
        "version": 1,
        "is_current": False,
        "published_at": None,
        "published_by": None,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "is_deleted": False,
    }
    values.update(overrides)
    return Program(**values)


def exercise() -> Exercise:
    return Exercise(
        id=uuid.uuid4(),
        name_ru="Планка",
        muscle_group="кор",
        secondary_muscle_groups=[],
        difficulty=1,
        tags=[],
        limitations=[],
        weight_rule="total",
        media_source="none",
        is_deleted=False,
    )


class Scalars:
    def __init__(self, items):
        self.items = items

    def all(self):
        return self.items


class ValidationSession:
    def __init__(self, exercises):
        self.exercises = exercises
        self.calls = 0

    async def scalars(self, _statement):
        self.calls += 1
        return Scalars(self.exercises)


@pytest.mark.asyncio
async def test_empty_program_cannot_be_published_without_catalog_query() -> None:
    session = ValidationSession([])
    errors = await program_publication.validate_for_publication(session, program())  # type: ignore[arg-type]
    assert "Добавьте хотя бы один тренировочный день." in errors
    assert session.calls == 0


@pytest.mark.asyncio
async def test_valid_program_passes_strict_publication_validation() -> None:
    item = exercise()
    draft = program(
        structure={
            "level": "beginner",
            "workout_type": "full_body",
            "sex": ["female"],
            "location": "home",
            "equipment": ["bodyweight"],
            "limitations": [],
            "days_per_week": 1,
            "schedule": [
                {
                    "day_index": 1,
                    "exercises": [
                        {
                            "exercise_id": str(item.id),
                            "sets": 3,
                            "reps": "10-12",
                            "rest_sec": 60,
                        }
                    ],
                }
            ],
        }
    )
    session = ValidationSession([item])
    assert await program_publication.validate_for_publication(session, draft) == []  # type: ignore[arg-type]
    assert session.calls == 1


@pytest.mark.asyncio
async def test_every_seed_program_is_publishable() -> None:
    root = Path(__file__).resolve().parents[1]
    program_rows = json.loads(
        (root / "scripts" / "seed_content" / "programs.json").read_text(encoding="utf-8")
    )
    exercise_rows = json.loads(
        (root / "scripts" / "seed_content" / "exercises.json").read_text(encoding="utf-8")
    )
    exercises = [
        SimpleNamespace(id=uuid.uuid4(), name_ru=row["name_ru"])
        for row in exercise_rows
    ]
    session = ValidationSession(exercises)

    failures = {}
    for row in program_rows:
        item = program(**row)
        errors = await program_publication.validate_for_publication(session, item)  # type: ignore[arg-type]
        if errors:
            failures[row["name"]] = errors

    assert failures == {}


def test_only_current_published_version_is_public_but_active_old_version_survives() -> None:
    current = program(
        publication_status="published",
        is_current=True,
        published_at=datetime.now(UTC),
    )
    previous = program(
        publication_status="published",
        is_current=False,
        published_at=datetime.now(UTC),
    )
    archived = program(publication_status="archived", is_current=False)
    draft = program()

    assert program_publication.is_accessible_to_user(current, None) is True
    assert program_publication.is_accessible_to_user(previous, previous.id) is True
    assert program_publication.is_accessible_to_user(archived, archived.id) is True
    assert program_publication.is_accessible_to_user(previous, None) is False
    assert program_publication.is_accessible_to_user(draft, draft.id) is False


class ListSession:
    def __init__(self):
        self.statements: list[str] = []

    async def scalar(self, statement):
        self.statements.append(str(statement))
        return 0

    async def execute(self, statement):
        self.statements.append(str(statement))
        return SimpleNamespace(scalars=lambda: Scalars([]))


@pytest.mark.asyncio
async def test_public_list_adds_publication_filters_and_admin_list_does_not() -> None:
    public = ListSession()
    await program_service.list_programs(public)  # type: ignore[arg-type]
    public_sql = " ".join(public.statements)
    assert "programs.publication_status" in public_sql
    assert "programs.is_current IS true" in public_sql

    admin = ListSession()
    await program_service.list_programs(admin, include_unpublished=True)  # type: ignore[arg-type]
    admin_sql = " ".join(admin.statements)
    assert "WHERE programs.is_deleted IS false AND programs.publication_status" not in admin_sql
    assert "WHERE programs.is_deleted IS false AND programs.is_current IS true" not in admin_sql


class MutationSession:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, item):
        self.added.append(item)

    async def flush(self):
        return None

    async def commit(self):
        self.commits += 1

    async def refresh(self, _item):
        return None


@pytest.mark.asyncio
async def test_editing_published_program_creates_draft_without_mutating_source(monkeypatch) -> None:
    source = program(
        name="Опубликована",
        publication_status="published",
        is_current=True,
        published_at=datetime.now(UTC),
    )
    draft = program(id=uuid.uuid4(), name=source.name, version=2)
    session = MutationSession()

    async def create_draft(_session, item):
        assert item is source
        return draft

    monkeypatch.setattr(program_publication, "create_draft_version", create_draft)
    updated = await program_service.update_program(
        session,  # type: ignore[arg-type]
        source,
        ProgramUpdate(name="Новая версия"),
    )

    assert updated is draft
    assert draft.name == "Новая версия"
    assert draft.publication_status == "draft"
    assert source.name == "Опубликована"
    assert source.is_current is True
    assert session.commits == 1


def test_migration_backfills_only_structurally_usable_programs() -> None:
    sql = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20260828000027_program_publication.sql"
    ).read_text(encoding="utf-8")
    assert "jsonb_array_length(structure -> 'schedule') > 0" in sql
    assert "programs_publication_status_check" in sql
    assert "uq_programs_current_version" in sql


@pytest.mark.asyncio
async def test_non_admin_cannot_request_drafts(monkeypatch) -> None:
    monkeypatch.setattr(programs_router, "user_is_admin", lambda _user: False)
    user = User(id=uuid.uuid4(), telegram_id=None, anthropometry={}, goals={})
    with pytest.raises(HTTPException) as exc:
        await programs_router.list_programs(
            admin_view=True,
            session=SimpleNamespace(),  # type: ignore[arg-type]
            user=user,
        )
    assert exc.value.status_code == 403
