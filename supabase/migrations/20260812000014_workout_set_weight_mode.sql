-- Preserve whether a dumbbell load is entered per hand or as a combined total.

ALTER TABLE workout_sets
    ADD COLUMN IF NOT EXISTS weight_mode TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_workout_sets_weight_mode'
    ) THEN
        ALTER TABLE workout_sets
            ADD CONSTRAINT ck_workout_sets_weight_mode
            CHECK (weight_mode IS NULL OR weight_mode IN ('total', 'per_hand'));
    END IF;
END $$;
