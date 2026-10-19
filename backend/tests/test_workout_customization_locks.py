"""Calendar's locked-user transaction also serializes old and new preparation writes."""
import asyncio
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.user import User
from app.schemas.workout import PlannedWorkoutReplacement
from app.services import planned_workout, workout_customization
from tests.test_workout_customization import database as database, request, base_plan


@pytest.mark.asyncio
async def test_existing_personal_write_waits_for_calendar_user_lock(database):
    session, owner, _, program, exercise, _, _ = database
    await workout_customization.save_customization(session, owner, request(program, exercise))
    async with async_sessionmaker(session.bind, expire_on_commit=False)() as concurrent:
        concurrent_owner = await concurrent.scalar(select(User).where(User.id == owner.id))
        await session.execute(select(User.id).where(User.id == owner.id).with_for_update())
        task = asyncio.create_task(workout_customization.save_customization(concurrent, concurrent_owner, request(program, revision=1, patch={})))
        try:
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(task), .15)
        finally:
            await session.commit()
            result = await task
        assert result.revision == 2


@pytest.mark.asyncio
async def test_existing_legacy_write_waits_for_calendar_user_lock(database):
    session, owner, _, program, exercise, base, _ = database
    kwargs = {"user_id": owner.id, "program_id": program.id, "scheduled_date": date(2026, 10, 19),
        "day_index": 1, "week_phase": "medium", "base_plan": base_plan(base)}
    await planned_workout.save_override(session, **kwargs, replacements=[PlannedWorkoutReplacement(from_exercise_id=base.id, to_exercise_id=exercise.id)])
    async with async_sessionmaker(session.bind, expire_on_commit=False)() as concurrent:
        await session.execute(select(User.id).where(User.id == owner.id).with_for_update())
        task = asyncio.create_task(planned_workout.save_override(concurrent, **kwargs, replacements=[]))
        try:
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(task), .15)
        finally:
            await session.commit()
            result = await task
        assert result["exercises"][0]["exercise_id"] == str(base.id)
