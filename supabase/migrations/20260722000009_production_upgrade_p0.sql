-- Production upgrade P0: media metadata, program types, workout plan snapshot

ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS media_duration_sec INTEGER,
    ADD COLUMN IF NOT EXISTS media_source TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'exercises_media_source_check'
    ) THEN
        ALTER TABLE exercises
            ADD CONSTRAINT exercises_media_source_check
            CHECK (media_source IN ('youtube', 'external', 'none'));
    END IF;
END $$;

ALTER TABLE programs
    ADD COLUMN IF NOT EXISTS workout_type TEXT NOT NULL DEFAULT 'custom',
    ADD COLUMN IF NOT EXISTS level TEXT,
    ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_programs_workout_type ON programs (workout_type);
CREATE INDEX IF NOT EXISTS idx_programs_level ON programs (level);
CREATE INDEX IF NOT EXISTS idx_programs_type_level ON programs (workout_type, target_level);

ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS workout_type TEXT,
    ADD COLUMN IF NOT EXISTS plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS duration_sec INTEGER;

COMMENT ON COLUMN workouts.plan IS 'Session structure snapshot: title, workout_type, exercises[{exercise_id, order, target_sets, target_reps, rest_sec}]';
COMMENT ON COLUMN exercises.media_source IS 'youtube | external | none — no self-hosted video bucket in v1';
