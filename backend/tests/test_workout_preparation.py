"""Prepared web starts bind owner, private revisions, program and calendar."""
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from app.models.workout import Workout
from app.schemas.workout import WorkoutCreate, WorkoutPlan
from app.services import workout_service, workout_customization
from app.services.offline_schedule import schedule_fingerprint
from tests.test_workout_customization import database as database, request
from tests.test_offline_workouts import scenario as scenario


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["private", "calendar", "program", "tamper", "none"])
async def test_prepared_web_start_guards_and_replay(database, change):
    from app.services.workout_preparation import plan_fingerprint
    session, owner, _, program, extra, base, _ = database
    owner.goals = {"active_program_id": str(program.id)}
    await session.commit()
    when = date(2026, 10, 19)
    plan = WorkoutPlan.model_validate(await workout_service.build_program_plan_for_user(session, owner, program,
        day_index=1, scheduled_date=when, week_phase="medium", consume_saved_override=False))
    fingerprint = plan_fingerprint(owner, program, plan, scheduled_date=when, day_index=1, week_phase="medium", cycle_readiness=None)
    stamp = {"prepared_at": datetime.now(UTC), "schedule_fingerprint": schedule_fingerprint(owner.goals), "plan_fingerprint": fingerprint}
    if change == "private":
        await workout_customization.save_customization(session, owner, request(program, extra))
    elif change == "calendar":
        owner.goals = {**owner.goals, "workout_schedule_overrides": [{"original_date": "2026-10-19", "target_date": "2026-10-20", "target_time": "10:00"}]}
        await session.commit()
    elif change == "program":
        program.version += 1
        await session.commit()
    elif change == "tamper":
        plan.exercises[0].rest_sec += 1
    payload = WorkoutCreate.model_validate({"program_id": program.id, "client_workout_id": uuid4(), "day_index": 1,
        "scheduled_date": when, "week_phase": "medium", "execution_version": 2, "plan": plan, "preparation": stamp})
    if change != "none":
        with pytest.raises(HTTPException) as caught:
            await workout_service.create_workout(session, owner, payload)
        assert caught.value.status_code == 409
        assert not (await session.scalars(select(Workout))).all()
    else:
        created = await workout_service.create_workout(session, owner, payload)
        # A later change must not turn an acknowledged same-ID replay into a conflict.
        program.version += 1
        await session.commit()
        assert (await workout_service.create_workout(session, owner, payload)).id == created.id


@pytest.mark.asyncio
async def test_offline_context_does_not_give_complex_plan_to_old_client(monkeypatch, scenario):
    from unittest.mock import AsyncMock
    from app.services import offline_workouts
    from tests.test_workout_execution import method_plan
    user, _, builder = scenario
    builder.side_effect = None
    builder.return_value = method_plan()
    with pytest.raises(HTTPException) as caught:
        await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1)
    assert caught.value.status_code == 409
    result = await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1, execution_version=2)
    assert all(row.preparation_fingerprint for row in result.plans)



@pytest.mark.asyncio
async def test_preparation_keeps_six_mib_bound_and_accepts_explicit_short_range(scenario):
    from unittest.mock import AsyncMock
    from app.services import offline_workouts
    user, _, builder = scenario
    user.goals.update(cycle_training_enabled=True, workout_illness_recovery={"choice_pending": False, "light_cycle_active": True})
    builder.side_effect = None
    builder.return_value = {"exercises": [{"exercise_id": str(uuid4()), "order": i + 1, "note": "x" * 500} for i in range(20)]}
    with pytest.raises(HTTPException) as caught:
        await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=14, execution_version=2)
    assert caught.value.status_code == 413
    short = await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1, execution_version=2)
    assert len(short.days) == 1 and all(len(row.plan.exercises) == 20 for row in short.plans)


def test_fingerprint_is_semantic_and_owner_scoped():
    from types import SimpleNamespace
    from app.services.workout_preparation import plan_fingerprint
    from tests.test_workout_execution import method_plan
    owner, program = SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4(), version=1)
    plan = WorkoutPlan.model_validate(method_plan())
    kwargs = {"scheduled_date": date(2026, 10, 19), "day_index": 1, "week_phase": "medium", "cycle_readiness": "normal"}
    first = plan_fingerprint(owner, program, plan, **kwargs)
    from decimal import Decimal
    for part in plan.exercises[0].set_methods[0].parts:
        part.target_weight = Decimal("100.00")
    plan.exercises[0].suggested_weight = Decimal("90")
    assert plan_fingerprint(owner, program, plan, **kwargs) == first
    assert plan_fingerprint(SimpleNamespace(id=uuid4()), program, plan, **kwargs) != first
    plan.customization_revisions = {"program_day": 1}
    assert plan_fingerprint(owner, program, plan, **kwargs) != first

@pytest.mark.asyncio
async def test_capable_bundle_carries_canonical_added_exercise_defaults(scenario):
    from unittest.mock import AsyncMock
    from app.services import offline_workouts
    user, _, _ = scenario
    result = await offline_workouts.prepare_context(AsyncMock(), user, start=date(2026, 10, 19), days=1, execution_version=2)
    for row in result.plans:
        defaults = row.model_dump().get("exercise_defaults")
        assert defaults == {"target_reps": {"light": "12-15", "medium": "8-10", "heavy": "5-8"}[row.week_phase], "rest_sec": 90 if row.week_phase == "heavy" else 60}
