BEGIN;

ALTER TABLE competitions
    DROP CONSTRAINT IF EXISTS ck_competitions_duration,
    DROP CONSTRAINT IF EXISTS competitions_duration_days_check;

ALTER TABLE competitions
    ADD COLUMN IF NOT EXISTS title VARCHAR(120),
    ADD COLUMN IF NOT EXISTS factors JSONB NOT NULL
        DEFAULT '[{"metric":"regularity"}]'::jsonb,
    ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(32) NOT NULL
        DEFAULT 'aggregate_v1';

ALTER TABLE competitions
    ADD CONSTRAINT ck_competitions_duration
        CHECK (duration_days BETWEEN 7 AND 365),
    ADD CONSTRAINT ck_competitions_factors_array
        CHECK (jsonb_typeof(factors) = 'array' AND jsonb_array_length(factors) BETWEEN 1 AND 4);

ALTER TABLE competition_participants
    ADD COLUMN IF NOT EXISTS baseline JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN competitions.factors IS
    'Consent snapshot of 1-4 aggregate metrics; exercise_id is allowed only for relative strength.';
COMMENT ON COLUMN competition_participants.baseline IS
    'Immutable per-factor baseline captured when both participants accept.';

COMMIT;
