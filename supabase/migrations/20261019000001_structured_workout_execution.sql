-- Add structured facts without altering ordinary historical reps/weight or slot identities.
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS execution_kind TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS execution_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workout_sets ADD CONSTRAINT ck_workout_sets_execution_kind CHECK (execution_kind IN ('standard', 'drop', 'cluster'));
ALTER TABLE workout_sets ADD CONSTRAINT ck_workout_sets_execution_revision CHECK (execution_revision >= 0);
ALTER TABLE workout_sets ADD CONSTRAINT ck_workout_sets_compound_parent CHECK (execution_kind = 'standard' OR (reps IS NULL AND weight IS NULL));
CREATE TABLE IF NOT EXISTS workout_set_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_set_id UUID NOT NULL REFERENCES workout_sets(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 8),
    reps INTEGER CHECK (reps BETWEEN 0 AND 100000),
    weight NUMERIC(8,2) CHECK (weight > 0 AND weight <= 10000),
    duration_sec INTEGER CHECK (duration_sec BETWEEN 0 AND 86400),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
    rest_after_sec INTEGER NOT NULL DEFAULT 0 CHECK (rest_after_sec BETWEEN 0 AND 600),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_workout_set_parts_ordinal UNIQUE (workout_set_id, ordinal),
    CONSTRAINT ck_workout_set_parts_completed CHECK (status <> 'completed' OR (COALESCE(reps, 0) > 0 AND COALESCE(weight, 0) > 0))
);
CREATE INDEX idx_workout_set_parts_parent ON workout_set_parts(workout_set_id);
CREATE TRIGGER trg_workout_set_parts_updated_at BEFORE UPDATE ON workout_set_parts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE IF NOT EXISTS workout_set_execution_receipts (
    workout_set_id UUID NOT NULL REFERENCES workout_sets(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    request_hash TEXT NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workout_set_id, operation_id)
);
