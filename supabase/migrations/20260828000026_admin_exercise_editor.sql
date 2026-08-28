-- Stage 5 admin exercise editor: richer catalog metadata and weight accounting.

ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS secondary_muscle_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS weight_rule TEXT NOT NULL DEFAULT 'total';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'exercises_weight_rule_check'
    ) THEN
        ALTER TABLE exercises
            ADD CONSTRAINT exercises_weight_rule_check
            CHECK (weight_rule IN ('total', 'per_hand', 'per_side', 'none'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercises_equipment_active
    ON exercises (equipment) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_exercises_secondary_muscles
    ON exercises USING gin (secondary_muscle_groups);
CREATE INDEX IF NOT EXISTS idx_exercises_tags
    ON exercises USING gin (tags);

COMMENT ON COLUMN exercises.weight_rule IS
    'total | per_hand | per_side | none — default weight accounting rule for UI and reports';
