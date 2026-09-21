"""Personal workout duration summaries for versioned programs."""

from __future__ import annotations

import uuid
from collections import defaultdict
from statistics import median
from typing import Iterable, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.program import Program
from app.models.workout import Workout


MIN_DURATION_SEC = 10 * 60
MAX_DURATION_SEC = 4 * 60 * 60
MIN_SAMPLES = 3
MAX_SAMPLES = 6


def typical_duration_minutes(durations_sec: Iterable[int | None]) -> tuple[int | None, int]:
    """Return a robust typical duration after enough plausible completed sessions."""
    values = [
        int(value)
        for value in durations_sec
        if value is not None and MIN_DURATION_SEC <= int(value) <= MAX_DURATION_SEC
    ][:MAX_SAMPLES]
    if len(values) < MIN_SAMPLES:
        return None, len(values)
    minutes = (int(median(values)) + 30) // 60
    return max(5, min(240, minutes)), len(values)


async def for_programs(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    programs: Sequence[Program],
) -> dict[uuid.UUID, tuple[int, int]]:
    """Map current program ids to the user's median across the same version family."""
    keys = {program.program_key for program in programs if program.program_key}
    if not keys:
        return {}

    ranked = (
        select(
            Program.program_key.label("program_key"),
            Workout.duration_sec.label("duration_sec"),
            func.row_number().over(
                partition_by=Program.program_key,
                order_by=Workout.completed_at.desc(),
            ).label("position"),
        )
        .join(Program, Program.id == Workout.program_id)
        .where(
            Workout.user_id == user_id,
            Workout.status == "completed",
            Workout.is_deleted.is_(False),
            Workout.duration_sec.between(MIN_DURATION_SEC, MAX_DURATION_SEC),
            Program.program_key.in_(keys),
        )
        .subquery()
    )
    result = await session.execute(
        select(ranked.c.program_key, ranked.c.duration_sec)
        .where(ranked.c.position <= MAX_SAMPLES)
        .order_by(ranked.c.program_key, ranked.c.position)
    )
    by_key: dict[str, list[int]] = defaultdict(list)
    for program_key, duration_sec in result.all():
        by_key[str(program_key)].append(int(duration_sec))

    summaries: dict[uuid.UUID, tuple[int, int]] = {}
    for program in programs:
        minutes, sample_size = typical_duration_minutes(by_key.get(program.program_key, []))
        if minutes is not None:
            summaries[program.id] = (minutes, sample_size)
    return summaries
