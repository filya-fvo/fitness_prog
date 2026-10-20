-- Preserve skipped ordinary participants across devices; existing history stays ordinary.
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE workout_sets ADD CONSTRAINT ck_workout_sets_skip_completion CHECK (NOT (is_skipped AND is_completed));
ALTER TABLE workout_sets ADD CONSTRAINT ck_workout_sets_skip_standard CHECK (NOT is_skipped OR execution_kind = 'standard');
