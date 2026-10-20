"""Run the actual production migration runner twice against an isolated old schema."""
import asyncio
import os
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from tests.test_workout_customization import database as database, migration


@pytest.mark.asyncio
async def test_real_runner_preserves_history_and_skips_applied_files(database, tmp_path):
    session, owner, _, program, _, base, _ = database
    from datetime import date
    from app.schemas.workout import WorkoutCreate, WorkoutSetCreate
    from app.services import workout_service
    workout = await workout_service.create_workout(session, owner, WorkoutCreate(scheduled_date=date(2026, 10, 20),
        plan={"exercises": [{"exercise_id": str(base.id), "order": 1, "target_sets": 1}]}))
    result = await workout_service.add_workout_set(session, owner, workout.id, WorkoutSetCreate(exercise_id=base.id, set_number=1, reps=10, weight=50, is_completed=True))
    await session.commit()
    schema = "runner_test_" + uuid4().hex
    source = (await session.execute(text("SELECT current_schema()"))).scalar_one()
    await session.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        for table in ["users", "programs", "exercises", "workouts", "workout_sets"]:
            await session.execute(text(f'CREATE TABLE "{schema}".{table} (LIKE "{source}".{table} INCLUDING ALL)'))
            await session.execute(text(f'INSERT INTO "{schema}".{table} SELECT * FROM "{source}".{table}'))
        await session.execute(text(f'ALTER TABLE "{schema}".workout_sets DROP COLUMN execution_kind CASCADE, DROP COLUMN execution_revision CASCADE, DROP COLUMN is_skipped CASCADE'))
        await session.commit()
        for filename in ["20261019000000_personal_workout_customizations.sql", "20261019000001_structured_workout_execution.sql", "20261020000000_workout_set_skips.sql"]:
            shutil.copyfile(migration().with_name(filename), tmp_path / filename)
        url = make_url(os.environ["WORKOUT_METHODS_TEST_URL"])
        env = dict(os.environ, PGHOST=url.host, PGPORT=str(url.port), PGDATABASE=url.database, PGUSER=url.username,
                   PGOPTIONS=f"-c search_path={schema},{source}", MIGRATIONS_DIR=tmp_path.as_posix())
        if url.password:
            env["PGPASSWORD"] = url.password
        if os.name == "nt":
            shell = "C:/Program Files/Git/bin/bash.exe"
            env["PATH"] = "C:/Program Files/PostgreSQL/18/bin;" + env["PATH"]
        else:
            shell = "sh"
        runner = Path(__file__).resolve().parents[2] / "scripts/apply_migrations_vps.sh"
        def run():
            completed = subprocess.run([shell, runner.as_posix()], env=env, capture_output=True, text=True, timeout=60)
            assert completed.returncode == 0, completed.stdout + completed.stderr
            return completed.stdout
        first = await asyncio.to_thread(run)
        second = await asyncio.to_thread(run)
        assert first.count("APPLY ") == 3
        assert second.count("SKIP ") == 3 and "APPLY " not in second
        assert (await session.execute(text(f'SELECT count(*) FROM "{schema}".fitness_schema_migrations'))).scalar_one() == 3
        row = (await session.execute(text(f'SELECT reps, weight, is_completed, execution_kind, execution_revision, is_skipped FROM "{schema}".workout_sets WHERE id=:id'), {"id": result.id})).one()
        assert tuple(row) == (10, 50, True, "standard", 0, False)
    finally:
        await session.rollback()
        await session.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await session.commit()
