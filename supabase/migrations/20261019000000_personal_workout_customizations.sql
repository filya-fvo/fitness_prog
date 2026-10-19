-- Private program-day deltas. PostgreSQL 15+ NULLS NOT DISTINCT protects permanent slots.
CREATE TABLE IF NOT EXISTS user_program_day_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    day_index INTEGER NOT NULL CHECK (day_index BETWEEN 1 AND 7),
    scheduled_date DATE,
    program_version INTEGER NOT NULL CHECK (program_version >= 1),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    patch JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(patch) = 'object'),
    last_operation_id UUID NOT NULL,
    last_operation_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_user_program_day_overrides_slot UNIQUE NULLS NOT DISTINCT
        (user_id, program_id, day_index, scheduled_date)
);
CREATE INDEX IF NOT EXISTS idx_user_program_day_overrides_user_program
    ON user_program_day_overrides(user_id, program_id);
DROP TRIGGER IF EXISTS trg_user_program_day_overrides_updated_at ON user_program_day_overrides;
CREATE TRIGGER trg_user_program_day_overrides_updated_at
    BEFORE UPDATE ON user_program_day_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
