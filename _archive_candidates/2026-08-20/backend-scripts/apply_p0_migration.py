"""Apply production upgrade P0 migration statements."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import engine

STMTS = [
    """
    ALTER TABLE exercises
        ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
        ADD COLUMN IF NOT EXISTS media_duration_sec INTEGER,
        ADD COLUMN IF NOT EXISTS media_source TEXT NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'exercises_media_source_check'
        ) THEN
            ALTER TABLE exercises
                ADD CONSTRAINT exercises_media_source_check
                CHECK (media_source IN ('youtube', 'external', 'none'));
        END IF;
    END $$
    """,
    """
    ALTER TABLE programs
        ADD COLUMN IF NOT EXISTS workout_type TEXT NOT NULL DEFAULT 'custom',
        ADD COLUMN IF NOT EXISTS level TEXT,
        ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT TRUE
    """,
    "CREATE INDEX IF NOT EXISTS idx_programs_workout_type ON programs (workout_type)",
    "CREATE INDEX IF NOT EXISTS idx_programs_level ON programs (level)",
    "CREATE INDEX IF NOT EXISTS idx_programs_type_level ON programs (workout_type, target_level)",
    """
    ALTER TABLE workouts
        ADD COLUMN IF NOT EXISTS title TEXT,
        ADD COLUMN IF NOT EXISTS workout_type TEXT,
        ADD COLUMN IF NOT EXISTS plan JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS duration_sec INTEGER
    """,
]


async def main() -> None:
    async with engine.begin() as conn:
        for i, stmt in enumerate(STMTS, 1):
            await conn.execute(text(stmt))
            print(f"ok {i}")
        rows = await conn.execute(
            text(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_name IN ('exercises', 'programs', 'workouts')
                  AND column_name IN (
                    'thumbnail_url', 'media_source', 'tags', 'media_duration_sec',
                    'workout_type', 'level', 'is_template', 'title', 'plan', 'duration_sec'
                  )
                ORDER BY 1, 2
                """
            )
        )
        for table_name, column_name in rows:
            print(table_name, column_name)
    print("MIGRATION_OK")


if __name__ == "__main__":
    asyncio.run(main())
