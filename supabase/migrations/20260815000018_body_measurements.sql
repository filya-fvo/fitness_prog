-- Dated body circumference history.

CREATE TABLE IF NOT EXISTS body_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date DATE NOT NULL,
    neck_cm NUMERIC(6, 2) CHECK (neck_cm BETWEEN 1 AND 500),
    shoulders_cm NUMERIC(6, 2) CHECK (shoulders_cm BETWEEN 1 AND 500),
    chest_cm NUMERIC(6, 2) CHECK (chest_cm BETWEEN 1 AND 500),
    waist_cm NUMERIC(6, 2) CHECK (waist_cm BETWEEN 1 AND 500),
    hips_cm NUMERIC(6, 2) CHECK (hips_cm BETWEEN 1 AND 500),
    bicep_cm NUMERIC(6, 2) CHECK (bicep_cm BETWEEN 1 AND 500),
    thigh_cm NUMERIC(6, 2) CHECK (thigh_cm BETWEEN 1 AND 500),
    calf_cm NUMERIC(6, 2) CHECK (calf_cm BETWEEN 1 AND 500),
    note TEXT,
    sources JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_body_measurements_user_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date
    ON body_measurements (user_id, date);

CREATE INDEX IF NOT EXISTS idx_body_measurements_is_deleted
    ON body_measurements (is_deleted) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_body_measurements_updated_at ON body_measurements;
CREATE TRIGGER trg_body_measurements_updated_at
    BEFORE UPDATE ON body_measurements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Preserve the last snapshot from the legacy users.anthropometry JSON.
WITH legacy AS (
    SELECT
        u.id,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'neck_cm') = 'number' THEN (u.anthropometry->'measurements'->>'neck_cm')::numeric END AS neck_cm,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'shoulders_cm') = 'number' THEN (u.anthropometry->'measurements'->>'shoulders_cm')::numeric END AS shoulders_cm,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'chest_cm') = 'number' THEN (u.anthropometry->'measurements'->>'chest_cm')::numeric END AS chest_cm,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'waist_cm') = 'number' THEN (u.anthropometry->'measurements'->>'waist_cm')::numeric END AS waist_cm,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'hips_cm') = 'number' THEN (u.anthropometry->'measurements'->>'hips_cm')::numeric END AS hips_cm,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'bicep_cm') = 'number' THEN (u.anthropometry->'measurements'->>'bicep_cm')::numeric END AS bicep_cm,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'thigh_cm') = 'number' THEN (u.anthropometry->'measurements'->>'thigh_cm')::numeric END AS thigh_cm,
        CASE WHEN jsonb_typeof(u.anthropometry->'measurements'->'calf_cm') = 'number' THEN (u.anthropometry->'measurements'->>'calf_cm')::numeric END AS calf_cm
    FROM users u
    WHERE jsonb_typeof(u.anthropometry->'measurements') = 'object'
      AND u.anthropometry->'measurements' <> '{}'::jsonb
), valid AS (
    SELECT
        id,
        CASE WHEN neck_cm BETWEEN 1 AND 500 THEN neck_cm END AS neck_cm,
        CASE WHEN shoulders_cm BETWEEN 1 AND 500 THEN shoulders_cm END AS shoulders_cm,
        CASE WHEN chest_cm BETWEEN 1 AND 500 THEN chest_cm END AS chest_cm,
        CASE WHEN waist_cm BETWEEN 1 AND 500 THEN waist_cm END AS waist_cm,
        CASE WHEN hips_cm BETWEEN 1 AND 500 THEN hips_cm END AS hips_cm,
        CASE WHEN bicep_cm BETWEEN 1 AND 500 THEN bicep_cm END AS bicep_cm,
        CASE WHEN thigh_cm BETWEEN 1 AND 500 THEN thigh_cm END AS thigh_cm,
        CASE WHEN calf_cm BETWEEN 1 AND 500 THEN calf_cm END AS calf_cm
    FROM legacy
)
INSERT INTO body_measurements (
    user_id, date, neck_cm, shoulders_cm, chest_cm, waist_cm,
    hips_cm, bicep_cm, thigh_cm, calf_cm, sources
)
SELECT
    id, CURRENT_DATE, neck_cm, shoulders_cm, chest_cm, waist_cm,
    hips_cm, bicep_cm, thigh_cm, calf_cm,
    jsonb_strip_nulls(jsonb_build_object(
        'neck_cm', CASE WHEN neck_cm IS NOT NULL THEN 'manual' END,
        'shoulders_cm', CASE WHEN shoulders_cm IS NOT NULL THEN 'manual' END,
        'chest_cm', CASE WHEN chest_cm IS NOT NULL THEN 'manual' END,
        'waist_cm', CASE WHEN waist_cm IS NOT NULL THEN 'manual' END,
        'hips_cm', CASE WHEN hips_cm IS NOT NULL THEN 'manual' END,
        'bicep_cm', CASE WHEN bicep_cm IS NOT NULL THEN 'manual' END,
        'thigh_cm', CASE WHEN thigh_cm IS NOT NULL THEN 'manual' END,
        'calf_cm', CASE WHEN calf_cm IS NOT NULL THEN 'manual' END
    ))
FROM valid
ON CONFLICT (user_id, date) DO NOTHING;
