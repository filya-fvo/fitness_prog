-- Optional symptom-led menstrual-cycle adaptation for daily training readiness.
-- No calendar phase is inferred and the field remains nullable until opt-in.

ALTER TABLE daily_metrics
    ADD COLUMN IF NOT EXISTS cycle_readiness TEXT;

ALTER TABLE daily_metrics
    DROP CONSTRAINT IF EXISTS ck_daily_metrics_cycle_readiness;

ALTER TABLE daily_metrics
    ADD CONSTRAINT ck_daily_metrics_cycle_readiness
    CHECK (
        cycle_readiness IS NULL
        OR cycle_readiness IN ('normal', 'caution', 'reduce', 'rest')
    );
