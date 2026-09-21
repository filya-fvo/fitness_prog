"""Personal duration estimates remain robust and require enough history."""

import uuid
from unittest.mock import AsyncMock

import pytest

from app.models.program import Program
from app.services.program_duration import for_programs, typical_duration_minutes


def test_typical_duration_requires_three_plausible_sessions() -> None:
    assert typical_duration_minutes([3600, 3900]) == (None, 2)
    assert typical_duration_minutes([120, 3600, 3900]) == (None, 2)


def test_typical_duration_uses_median_of_at_most_six_sessions() -> None:
    durations = [3600, 3900, 4200, 9000, 4000, 4100, 14400]
    minutes, samples = typical_duration_minutes(durations)

    assert minutes == 68
    assert samples == 6


@pytest.mark.asyncio
async def test_program_versions_share_the_same_personal_duration() -> None:
    current = Program(id=uuid.uuid4(), name="Текущая", structure={}, program_key="seed-family")
    another = Program(id=uuid.uuid4(), name="Другая", structure={}, program_key="other-family")
    result = AsyncMock()
    result.all = lambda: [
        ("seed-family", 3600),
        ("seed-family", 3900),
        ("seed-family", 4200),
        ("other-family", 3000),
    ]
    session = AsyncMock()
    session.execute.return_value = result

    summaries = await for_programs(
        session,
        user_id=uuid.uuid4(),
        programs=[current, another],
    )

    assert summaries == {current.id: (65, 3)}
