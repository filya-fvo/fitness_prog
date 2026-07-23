-- Stage 0: programs table (fitness-tz.md §4)
-- structure JSONB: day-by-day schedule

CREATE TABLE IF NOT EXISTS programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    target_level TEXT,
    duration_weeks INTEGER CHECK (duration_weeks IS NULL OR duration_weeks > 0),
    structure JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_programs_target_level ON programs (target_level);
CREATE INDEX IF NOT EXISTS idx_programs_is_deleted ON programs (is_deleted) WHERE is_deleted = FALSE;

COMMENT ON COLUMN programs.structure IS 'JSONB schedule by days (exercises, sets, rest)';
