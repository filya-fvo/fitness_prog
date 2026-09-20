"""Regression tests for immutable program seed synchronization."""

from __future__ import annotations

import uuid

import pytest

from app.models.program import Program
from app.services import seed_programs


def seed_row(*, name: str = "М · Дом · Новичок · Свой вес") -> dict:
    return {
        "name": name,
        "description": "Домашняя программа с весом тела, 3 дня.",
        "target_level": "beginner",
        "duration_weeks": 6,
        "structure": {
            "workout_type": "home_express",
            "level": "beginner",
            "sex": ["male"],
            "location": "home",
            "equipment": ["bodyweight"],
            "limitations": [],
            "days_per_week": 3,
            "schedule": [{"day_index": 1}, {"day_index": 2}, {"day_index": 3}],
        },
        "workout_type": "home_express",
        "level": "beginner",
        "is_template": True,
    }


def published_program(row: dict, **overrides) -> Program:
    values = {
        **row,
        "id": uuid.uuid4(),
        "publication_status": "published",
        "program_key": "seed-bodyweight",
        "version": 1,
        "is_current": True,
        "is_deleted": False,
    }
    values.update(overrides)
    return Program(**values)


class Scalars:
    def __init__(self, items: list[Program]):
        self.items = items

    def all(self) -> list[Program]:
        return self.items


class SeedSession:
    def __init__(self, items: list[Program]):
        self.items = items
        self.added: list[Program] = []
        self.flushes = 0

    async def scalars(self, _statement) -> Scalars:
        return Scalars(self.items)

    def add(self, item: Program) -> None:
        self.added.append(item)

    async def flush(self) -> None:
        self.flushes += 1


@pytest.mark.asyncio
async def test_changed_seed_program_creates_version_without_mutating_assigned_plan() -> None:
    row = seed_row()
    previous_structure = {**row["structure"], "equipment": ["bodyweight", "bands"]}
    current = published_program(row, structure=previous_structure)
    session = SeedSession([current])

    stats = await seed_programs.sync_seed_programs(session, [row])  # type: ignore[arg-type]

    assert stats == seed_programs.SeedProgramSyncStats(versioned=1)
    assert current.structure["equipment"] == ["bodyweight", "bands"]
    assert current.is_current is False
    replacement = session.added[0]
    assert replacement.program_key == current.program_key
    assert replacement.version == 2
    assert replacement.is_current is True
    assert replacement.structure["equipment"] == ["bodyweight"]


@pytest.mark.asyncio
async def test_seed_rename_keeps_program_key_and_history() -> None:
    old_name = "М · Дом · Без нагрузки на колени · Свой вес"
    new_name = f"{old_name} + резинки"
    current = published_program(seed_row(name=old_name), name=old_name)
    row = seed_row(name=new_name)
    session = SeedSession([current])

    stats = await seed_programs.sync_seed_programs(
        session,
        [row],
        renames={old_name: new_name},
    )  # type: ignore[arg-type]

    assert stats.versioned == 1
    assert current.name == old_name
    assert current.is_current is False
    assert session.added[0].name == new_name
    assert session.added[0].program_key == current.program_key


@pytest.mark.asyncio
async def test_unchanged_seed_program_is_idempotent() -> None:
    row = seed_row()
    current = published_program(row)
    session = SeedSession([current])

    stats = await seed_programs.sync_seed_programs(session, [row])  # type: ignore[arg-type]

    assert stats == seed_programs.SeedProgramSyncStats(unchanged=1)
    assert session.added == []
    assert current.is_current is True
