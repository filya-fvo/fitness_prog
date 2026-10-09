"""Prepared-start parity on the caller's disposable PostgreSQL only."""

import time
import uuid
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.models.user import User
from app.models.user_entitlement import UserEntitlement
from app.models.exercise import Exercise
from app.models.program import Program
from app.models.workout import Workout, WorkoutSet
from app.models.workout_plan_override import WorkoutPlanOverride
from app.schemas.android_sync import Operation
from app.schemas.workout import WorkoutPlan, WorkoutCompleteRequest, WorkoutSetCreate
from app.services import offline_workouts, workout_service
from app.services.android_sync import service


async def check_offline_workout(engine):
    from zoneinfo import ZoneInfo

    day = datetime.now(ZoneInfo("Europe/Moscow")).date()
    owners = [uuid.uuid4(), uuid.uuid4()]
    program_id, exercise, replacement = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    goals = {
        "timezone": "Europe/Moscow",
        "active_program_id": str(program_id),
        "active_program_started_at": day.isoformat(),
        "active_program_next_day": 1,
        "active_program_week_phase": "medium",
        "active_program_phase_source": "manual",
        "workout_schedule": {"days": list(range(7)), "time": "10:00"},
    }
    async with AsyncSession(engine, expire_on_commit=False) as session:
        session.add_all(
            [
                User(
                    id=owner,
                    goals=deepcopy(goals),
                    anthropometry={},
                    subscription_status="pro_stars",
                )
                for owner in owners
            ]
        )
        session.add_all(
            [
                Exercise(
                    id=identity, name_ru="Offline parity " + str(identity), muscle_group="legs"
                )
                for identity in (exercise, replacement)
            ]
        )
        session.add(
            Program(
                id=program_id,
                name="Offline parity",
                publication_status="published",
                is_current=True,
                structure={
                    "days": [
                        {
                            "day_index": index,
                            "exercises": [{"exercise_id": str(exercise), "target_sets": 2}],
                        }
                        for index in (1, 2)
                    ]
                },
            )
        )
        await session.commit()
        session.add_all(
            [
                UserEntitlement(
                    user_id=owner,
                    code="plus",
                    source="qa",
                    starts_at=datetime.now(UTC) - timedelta(days=1),
                )
                for owner in owners
            ]
        )
        await session.commit()
        for owner in owners:
            session.add(
                WorkoutPlanOverride(
                    user_id=owner,
                    program_id=program_id,
                    scheduled_date=day,
                    day_index=1,
                    replacements=[
                        {"from_exercise_id": str(exercise), "to_exercise_id": str(replacement)}
                    ],
                )
            )
        await session.commit()
        user = await session.get(User, owners[0])
        before = deepcopy(user.goals)
        started = time.monotonic()
        context = await offline_workouts.prepare_context(session, user, start=day, days=14)
        elapsed = time.monotonic() - started
        assert len(context.days) == 14 and elapsed < 60, (len(context.days), elapsed)
        assert user.goals == before
        assert (
            await session.scalar(
                select(func.count()).select_from(Workout).where(Workout.user_id.in_(owners))
            )
            == 0
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(WorkoutPlanOverride)
                .where(WorkoutPlanOverride.user_id.in_(owners))
            )
            == 2
        )
        print(
            f"PASS: real read-only 14-day preparation {elapsed:.2f}s {len(context.plans)} plans {len(context.model_dump_json())} bytes"
        )

    def operation(identity, action, body, revision=None):
        return Operation(
            id=uuid.uuid4(),
            owner=owners[0],
            kind="workout",
            entityId=identity,
            action=action,
            body=body,
            baseRevision=revision,
            createdAt=1,
        )

    for index in (1, 2):
        target = day + timedelta(days=index - 1)
        saved = next(
            row.plan
            for row in context.plans
            if row.scheduled_date == target
            and row.day_index == index
            and row.week_phase == "medium"
            and row.readiness == "normal"
        )
        create = operation(
            str(uuid.uuid4()),
            "create",
            {
                "program_id": str(program_id),
                "scheduled_date": str(target),
                "day_index": index,
                "week_phase": "medium",
                "cycle_readiness": "normal",
                "plan": saved.model_dump(mode="json"),
                "offline_prepared_at": context.prepared_at.isoformat(),
                "offline_schedule_fingerprint": context.schedule_fingerprint,
            },
        )
        first = await service.push(engine, owners[0], create)
        assert await service.push(engine, owners[0], create) == first, "lost create ack duplicated"
        remote = first["entity"]
        wid = remote["id"]
        async with AsyncSession(engine, expire_on_commit=False) as session:
            web_user = await session.get(User, owners[1])
            web = await workout_service.start_program_workout(
                session,
                web_user,
                program_id,
                day_index=index,
                week_phase="medium",
                scheduled_date=target,
                cycle_readiness="normal",
            )
            assert WorkoutPlan.model_validate(web.plan) == WorkoutPlan.model_validate(
                remote["data"]["plan"]
            )
            assert len(web.sets) == len(remote["data"]["sets"]) == 2
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(WorkoutPlanOverride)
                    .where(
                        WorkoutPlanOverride.user_id.in_(owners),
                        WorkoutPlanOverride.scheduled_date == target,
                    )
                )
                == 0
            )
            set_body = {
                "exercise_id": str(replacement if index == 1 else exercise),
                "set_number": 1,
                "weight": 50,
                "reps": 10,
                "is_completed": True,
            }
            await workout_service.add_workout_set(
                session, web_user, web.id, WorkoutSetCreate(**set_body)
            )
            await workout_service.complete_workout(
                session, web_user, web.id, WorkoutCompleteRequest(rpe=7)
            )
        added = await service.push(
            engine, owners[0], operation(wid, "set", set_body, remote["revision"])
        )
        complete = operation(wid, "complete", {"rpe": 7}, added["entity"]["revision"])
        finished = await service.push(engine, owners[0], complete)
        assert await service.push(engine, owners[0], complete) == finished, (
            "lost complete ack duplicated"
        )
        async with AsyncSession(engine) as session:
            users = [await session.get(User, owner) for owner in owners]
            for field in (
                "active_program_next_day",
                "active_program_week_phase",
                "active_program_workouts_in_phase",
                "notification_state",
            ):
                assert users[0].goals.get(field) == users[1].goals.get(field), field
            assert users[0].goals["active_program_next_day"] == (2 if index == 1 else 1)
            assert users[0].goals["active_program_week_phase"] == (
                "medium" if index == 1 else "heavy"
            )
            actual = await session.get(Workout, uuid.UUID(wid))
            assert (
                actual.scheduled_date == target and actual.status == "completed" and actual.rpe == 7
            )
            rows = (
                await session.scalars(select(WorkoutSet).where(WorkoutSet.workout_id == actual.id))
            ).all()
            assert len(rows) == 2 and sum(row.is_completed for row in rows) == 1
            assert next(row for row in rows if row.is_completed).weight == 50
        duplicate = operation(str(uuid.uuid4()), "create", create.body)
        try:
            await service.push(engine, owners[0], duplicate)
        except HTTPException as exc:
            assert exc.status_code == 422
        else:
            raise AssertionError("duplicate occurrence accepted")
    async with AsyncSession(engine) as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Workout).where(Workout.user_id == owners[0])
            )
            == 2
        )
    print(
        "PASS: two prepared starts equal web starts, replacements consumed, set slots/values/dates/status, cursor once, receipt replay and duplicate occurrence denial"
    )

    # Same exercises, competing canonical schedule change must be detected.
    from datetime import time as daytime
    from app.services.workout_reschedule import reschedule_workout_occurrence
    from zoneinfo import ZoneInfo
    moved_owner = uuid.uuid4()
    original = day if day.weekday() < 6 else day + timedelta(days=1)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        moved_user = User(id=moved_owner, goals=deepcopy(goals), anthropometry={})
        session.add(moved_user)
        await session.commit()
        session.add(UserEntitlement(user_id=moved_owner,code="plus",source="qa",starts_at=datetime.now(UTC)-timedelta(days=1)))
        await session.commit()
        prepared = await offline_workouts.prepare_context(session,moved_user,start=original,days=2)
        saved = next(row.plan for row in prepared.plans if row.scheduled_date==original and row.day_index==1 and row.week_phase=="medium")
        await reschedule_workout_occurrence(session,moved_user,original_date=original,target_date=original+timedelta(days=1),target_time=daytime(10),conflict_resolution="cancel_existing",now=datetime.combine(original,daytime(9),ZoneInfo("Europe/Moscow")))
    moved_op = Operation(id=uuid.uuid4(),owner=moved_owner,kind="workout",entityId=str(uuid.uuid4()),action="create",body={"program_id":str(program_id),"scheduled_date":str(original),"day_index":1,"week_phase":"medium","plan":saved.model_dump(mode="json"),"offline_prepared_at":prepared.prepared_at.isoformat(),"offline_schedule_fingerprint":prepared.schedule_fingerprint},baseRevision=None,createdAt=1)
    try:
        await service.push(engine,moved_owner,moved_op)
    except HTTPException as exc:
        assert exc.status_code==422 and "расписание" in exc.detail.lower()
    else:
        raise AssertionError("rescheduled occurrence accepted silently")
    async with AsyncSession(engine) as session:
        assert await session.scalar(select(func.count()).select_from(Workout).where(Workout.user_id==moved_owner))==0
    print("PASS: canonical reschedule detected with unchanged exercises; local operation rejected explicitly")
