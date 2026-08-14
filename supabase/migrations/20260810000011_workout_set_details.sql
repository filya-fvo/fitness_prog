-- Persist timed/cardio set details that were previously stored only in IndexedDB.

ALTER TABLE workout_sets
    ADD COLUMN IF NOT EXISTS duration_sec INTEGER,
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS machine_params JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_workout_sets_duration_sec'
    ) THEN
        ALTER TABLE workout_sets
            ADD CONSTRAINT ck_workout_sets_duration_sec
            CHECK (duration_sec IS NULL OR duration_sec BETWEEN 0 AND 86400);
    END IF;
END $$;
