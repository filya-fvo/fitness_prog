-- Weight belongs to dated body measurements, not the daily activity check-in.
-- Preserve every existing daily weight before removing the legacy column.

ALTER TABLE body_measurements
    ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(6, 2)
    CHECK (weight_kg BETWEEN 20 AND 500);

INSERT INTO body_measurements (
    user_id,
    date,
    weight_kg,
    sources,
    created_at,
    updated_at,
    is_deleted
)
SELECT
    user_id,
    date,
    weight_kg,
    jsonb_build_object(
        'weight_kg', COALESCE(sources->>'weight_kg', 'manual')
    ),
    created_at,
    updated_at,
    FALSE
FROM daily_metrics
WHERE weight_kg IS NOT NULL
  AND is_deleted = FALSE
ON CONFLICT (user_id, date) DO UPDATE
SET
    weight_kg = CASE
        WHEN body_measurements.is_deleted THEN EXCLUDED.weight_kg
        ELSE COALESCE(body_measurements.weight_kg, EXCLUDED.weight_kg)
    END,
    neck_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.neck_cm END,
    shoulders_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.shoulders_cm END,
    chest_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.chest_cm END,
    waist_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.waist_cm END,
    hips_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.hips_cm END,
    bicep_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.bicep_cm END,
    thigh_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.thigh_cm END,
    calf_cm = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.calf_cm END,
    note = CASE WHEN body_measurements.is_deleted THEN NULL ELSE body_measurements.note END,
    sources = CASE
        WHEN body_measurements.is_deleted THEN EXCLUDED.sources
        WHEN body_measurements.weight_kg IS NULL THEN
            body_measurements.sources || EXCLUDED.sources
        ELSE body_measurements.sources
    END,
    is_deleted = FALSE;

-- Keep calorie and macro calculations on the most recent measured weight.
WITH latest_weight AS (
    SELECT DISTINCT ON (user_id)
        user_id,
        weight_kg
    FROM body_measurements
    WHERE weight_kg IS NOT NULL
      AND is_deleted = FALSE
    ORDER BY user_id, date DESC, updated_at DESC
)
UPDATE users AS user_row
SET anthropometry = jsonb_set(
    COALESCE(user_row.anthropometry, '{}'::jsonb),
    '{weight_kg}',
    to_jsonb(latest_weight.weight_kg),
    TRUE
)
FROM latest_weight
WHERE user_row.id = latest_weight.user_id;

UPDATE daily_metrics
SET sources = sources - 'weight_kg'
WHERE sources ? 'weight_kg';

ALTER TABLE daily_metrics
    DROP COLUMN IF EXISTS weight_kg;

COMMENT ON COLUMN body_measurements.weight_kg IS
    'Dated body weight in kilograms; migrated from legacy daily_metrics.weight_kg';
