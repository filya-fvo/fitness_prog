"""Deleting a program workout must restore that exact day in the cycle."""

from datetime import date
from uuid import uuid4

import pytest

from app.models.program import Program
from app.models.user import User
from app.models.workout import Workout
from app.services.workout_service import _rollback_program_cursor_for_deleted_workout


class ProgramSession:
    def __init__(self, program: Program) -> None:
        self.program = program

    async def scalar(self, _query):
        return self.program


def ppl6_program(program_id) -> Program:
    names = ["Жим A", "Тяга A", "Ноги A", "Жим B", "Тяга B", "Ноги B"]
    return Program(
        id=program_id,
        name="PPL 6",
        workout_type="strength",
        structure={
            "schedule": [
                {"day_index": index, "name": name, "exercises": []}
                for index, name in enumerate(names, start=1)
            ]
        },
    )


@pytest.mark.asyncio
async def test_deleting_pull_b_restores_pull_b_instead_of_legs_b() -> None:
    user_id, program_id = uuid4(), uuid4()
    user = User(
        id=user_id,
        telegram_id=None,
        anthropometry={},
        goals={
            "active_program_id": str(program_id),
            "active_program_next_day": 6,
            "active_program_week_phase": "medium",
            "active_program_workouts_in_phase": 5,
        },
    )
    pull_b = Workout(
        id=uuid4(),
        user_id=user_id,
        program_id=program_id,
        scheduled_date=date(2026, 8, 13),
        status="completed",
        title="Тяга B · Средняя",
        plan={"day_index": 5, "week_phase": "medium", "title": "Тяга B · Средняя"},
    )

    await _rollback_program_cursor_for_deleted_workout(
        ProgramSession(ppl6_program(program_id)),  # type: ignore[arg-type]
        user,
        pull_b,
    )

    assert user.goals["active_program_next_day"] == 5
    assert user.goals["active_program_week_phase"] == "medium"
    assert user.goals["active_program_workouts_in_phase"] == 4


@pytest.mark.asyncio
async def test_rollback_does_not_require_cursor_to_point_to_expected_next_day() -> None:
    """Out-of-order client updates and later rows must not suppress deletion rollback."""
    user_id, program_id = uuid4(), uuid4()
    user = User(
        id=user_id,
        telegram_id=None,
        anthropometry={},
        goals={
            "active_program_id": str(program_id),
            "active_program_next_day": 2,
            "active_program_week_phase": "light",
            "active_program_workouts_in_phase": 1,
        },
    )
    deleted = Workout(
        id=uuid4(),
        user_id=user_id,
        program_id=program_id,
        scheduled_date=date(2026, 8, 10),
        status="completed",
        plan={"day_index": 5, "week_phase": "heavy", "title": "Тяга B · Тяжёлая"},
    )

    await _rollback_program_cursor_for_deleted_workout(
        ProgramSession(ppl6_program(program_id)),  # type: ignore[arg-type]
        user,
        deleted,
    )

    assert user.goals["active_program_next_day"] == 5
    assert user.goals["active_program_week_phase"] == "heavy"
    assert user.goals["active_program_workouts_in_phase"] == 4


@pytest.mark.asyncio
async def test_legacy_snapshot_resolves_program_day_by_title() -> None:
    user_id, program_id = uuid4(), uuid4()
    user = User(
        id=user_id,
        telegram_id=None,
        anthropometry={},
        goals={"active_program_id": str(program_id), "active_program_next_day": 6},
    )
    legacy = Workout(
        id=uuid4(),
        user_id=user_id,
        program_id=program_id,
        scheduled_date=date(2026, 8, 13),
        status="completed",
        title="Тяга B · Средняя",
        plan={"title": "Тяга B · Средняя"},
    )

    await _rollback_program_cursor_for_deleted_workout(
        ProgramSession(ppl6_program(program_id)),  # type: ignore[arg-type]
        user,
        legacy,
    )

    assert user.goals["active_program_next_day"] == 5
    assert user.goals["active_program_workouts_in_phase"] == 4


@pytest.mark.asyncio
async def test_deleting_workout_from_inactive_program_does_not_move_active_cursor() -> None:
    user_id, active_program_id, deleted_program_id = uuid4(), uuid4(), uuid4()
    user = User(
        id=user_id,
        telegram_id=None,
        anthropometry={},
        goals={"active_program_id": str(active_program_id), "active_program_next_day": 3},
    )
    deleted = Workout(
        id=uuid4(),
        user_id=user_id,
        program_id=deleted_program_id,
        scheduled_date=date(2026, 8, 13),
        status="completed",
        plan={"day_index": 5, "week_phase": "medium"},
    )

    await _rollback_program_cursor_for_deleted_workout(
        ProgramSession(ppl6_program(deleted_program_id)),  # type: ignore[arg-type]
        user,
        deleted,
    )

    assert user.goals["active_program_next_day"] == 3
