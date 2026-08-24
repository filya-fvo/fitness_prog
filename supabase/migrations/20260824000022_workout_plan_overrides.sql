-- Date-scoped exercise replacements prepared before a program workout starts.

CREATE TABLE IF NOT EXISTS workout_plan_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    day_index INTEGER NOT NULL CHECK (day_index >= 1),
    week_phase TEXT CHECK (week_phase IS NULL OR week_phase IN ('light', 'medium', 'heavy')),
    replacements JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_workout_plan_overrides_slot
        UNIQUE (user_id, program_id, scheduled_date, day_index),
    CONSTRAINT ck_workout_plan_overrides_replacements_array
        CHECK (jsonb_typeof(replacements) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_workout_plan_overrides_user_date
    ON workout_plan_overrides (user_id, scheduled_date)
    WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_workout_plan_overrides_updated_at ON workout_plan_overrides;
CREATE TRIGGER trg_workout_plan_overrides_updated_at
    BEFORE UPDATE ON workout_plan_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
