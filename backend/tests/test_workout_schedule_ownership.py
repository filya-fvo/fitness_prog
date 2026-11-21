"""Exercise schedule mutations against a local synthetic store.

The storage shim executes the actual SQL predicates for scalar reads and
updates. It does not test PostgreSQL transactions or row lock behavior.
"""

from datetime import UTC, date, datetime, time
import json
import re
import sqlite3
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.selectable import CompoundSelect

from app.models.program import Program
from app.models.user import User
from app.services import scheduler, supplement_intakes, workout_reschedule


SOURCE = date(2026, 11, 11)
FREE_DATE = date(2026, 11, 12)
NEXT_DATE = date(2026, 11, 13)
LOCAL_NOW = datetime(2026, 11, 11, 6, tzinfo=UTC)


def run_without_io(coroutine):
    """These coroutines use in-memory storage and do not suspend."""
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    finally:
        coroutine.close()
    raise AssertionError("The test unexpectedly attempted asynchronous I/O")


class ScheduleStore:
    def __init__(self):
        self.program_id = uuid4()
        self.user = User(id=uuid4(), goals={
            "active_program_id": str(self.program_id),
            "active_program_next_day": 2,
            "active_program_started_at": SOURCE.isoformat(),
            "workout_schedule": {"version": 1, "days": [0, 2, 4], "start_time": "08:00"},
        })
        self.db = sqlite3.connect(":memory:")
        self.db.create_function("now", 0, lambda: "2026-11-11T06:00:00")
        self.db.executescript("""
            CREATE TABLE workouts (
                id TEXT PRIMARY KEY, user_id TEXT, program_id TEXT, scheduled_date TEXT,
                status TEXT, is_deleted INTEGER, plan TEXT, updated_at TEXT, started_at TEXT
            );
            CREATE TABLE workout_plan_overrides (
                id TEXT PRIMARY KEY, user_id TEXT, program_id TEXT, scheduled_date TEXT,
                day_index INTEGER, is_deleted INTEGER, updated_at TEXT
            );
            CREATE TABLE user_program_day_overrides (
                id TEXT PRIMARY KEY, user_id TEXT, program_id TEXT, scheduled_date TEXT,
                day_index INTEGER, is_deleted INTEGER
            );
        """)
        self.commit_count = 0

    def workout(self, program, day, *, status="planned", started_at=None):
        uid = str(uuid4())
        plan = json.dumps({"day_index": str(day)}) if day else "{}"
        self.db.execute("INSERT INTO workouts VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?)",
            (uid, str(self.user.id), str(program) if program else None, str(SOURCE), status, plan, started_at))
        return uid

    def preparation(self, table, day, slot, *, program=None):
        uid = str(uuid4())
        self.db.execute(
            f"INSERT INTO {table} (id, user_id, program_id, scheduled_date, day_index, is_deleted) VALUES (?, ?, ?, ?, ?, 0)",
            (uid, str(self.user.id), str(program or self.program_id), str(slot), day),
        )
        return uid

    def stored_date(self, table, uid):
        return self.db.execute(f"SELECT scheduled_date FROM {table} WHERE id = ?", (uid,)).fetchone()[0]

    def _query(self, statement):
        compiled = statement.compile(
            dialect=postgresql.dialect(paramstyle="named"), compile_kwargs={"render_postcompile": True}
        )
        sql = re.sub(r"::[A-Z]+| FOR UPDATE", "", str(compiled))
        params = {key: str(value) if isinstance(value, (UUID, date)) else value for key, value in compiled.params.items()}
        return self.db.execute(sql, params)

    async def scalar(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity is User:
            return self.user
        if entity is Program:
            return SimpleNamespace(id=self.program_id, name="Основная", owner_id=None, structure={})
        row = self._query(statement).fetchone()
        return row[0] if row else None

    async def scalars(self, statement):
        if isinstance(statement, CompoundSelect):
            dates = [date.fromisoformat(row[0]) for row in self._query(statement)]
            return SimpleNamespace(all=lambda: dates)
        return SimpleNamespace(all=lambda: [])

    async def execute(self, statement, *args):
        return self._query(statement)

    async def commit(self):
        self.db.commit()
        self.commit_count += 1

    async def refresh(self, *args, **kwargs):
        pass


@pytest.fixture
def store(monkeypatch):
    store = ScheduleStore()

    async def overview(session, user, day):
        return scheduler.schedule_overview(user.goals or {}, day)

    monkeypatch.setattr(scheduler, "get_schedule_overview", overview)
    monkeypatch.setattr(supplement_intakes, "reset_pending_days", AsyncMock())
    yield store
    store.db.close()


def move(store, target=FREE_DATE, **kwargs):
    return run_without_io(workout_reschedule.reschedule_workout_occurrence(
        store, store.user, original_date=SOURCE, target_date=target,
        target_time=time(8), now=LOCAL_NOW, **kwargs,
    ))


def test_other_program_completion_does_not_block_reschedule(store):
    other = store.workout(uuid4(), 2, status="completed")
    pending = store.workout(store.program_id, 2)

    move(store)

    assert store.stored_date("workouts", other) == str(SOURCE)
    assert store.stored_date("workouts", pending) == str(FREE_DATE)


def test_reschedule_leaves_other_days_of_same_program_untouched(store):
    pending = store.workout(store.program_id, 2)
    another = store.workout(store.program_id, 3)

    move(store)

    assert store.stored_date("workouts", pending) == str(FREE_DATE)
    assert store.stored_date("workouts", another) == str(SOURCE)


def test_same_program_legacy_completion_is_conservatively_protected(store):
    store.workout(store.program_id, None, status="completed")

    with pytest.raises(HTTPException) as error:
        move(store)

    assert error.value.status_code == 409
    assert store.commit_count == 0


def test_cancel_moves_only_the_selected_program_day_preparation(store):
    table = "workout_plan_overrides"
    source = store.preparation(table, 2, SOURCE)
    unrelated = store.preparation(table, 3, SOURCE)

    run_without_io(scheduler.cancel_workout_occurrence(store, store.user, scheduled_date=SOURCE, now=LOCAL_NOW))

    assert store.stored_date(table, source) == str(NEXT_DATE)
    assert store.stored_date(table, unrelated) == str(SOURCE)


def test_reschedule_cannot_merge_legacy_source_with_modern_target(store):
    legacy = "workout_plan_overrides"
    modern = "user_program_day_overrides"
    source = store.preparation(legacy, 2, SOURCE)
    target = store.preparation(modern, 2, FREE_DATE)

    with pytest.raises(HTTPException) as error:
        move(store)

    assert error.value.status_code == 409
    assert store.commit_count == 0
    assert store.stored_date(legacy, source) == str(SOURCE)
    assert store.stored_date(modern, target) == str(FREE_DATE)


def test_legacy_retry_after_displacement_does_not_move_again(store):
    move(store, target=NEXT_DATE, conflict_resolution="move_existing")
    after_move = store.user.goals["workout_schedule_overrides"]

    move(store, target=NEXT_DATE, conflict_resolution="move_existing")

    assert store.user.goals["workout_schedule_overrides"] == after_move
    assert store.commit_count == 1



@pytest.mark.parametrize("cancel", [False, True])
def test_schedule_change_preserves_a_started_workout(store, cancel):
    started = store.workout(store.program_id, 2, started_at=LOCAL_NOW.isoformat())

    with pytest.raises(HTTPException) as error:
        if cancel:
            run_without_io(scheduler.cancel_workout_occurrence(
                store, store.user, scheduled_date=SOURCE, now=LOCAL_NOW,
            ))
        else:
            move(store)

    assert error.value.status_code == 409
    assert store.commit_count == 0
    assert store.stored_date("workouts", started) == str(SOURCE)
