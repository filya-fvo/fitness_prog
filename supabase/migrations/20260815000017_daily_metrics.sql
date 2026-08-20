-- Manual daily sleep, movement and weight history.
-- Per-field source metadata leaves room for future device health integrations.

CREATE TABLE IF NOT EXISTS daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date DATE NOT NULL,
    sleep_minutes INTEGER CHECK (sleep_minutes BETWEEN 0 AND 1440),
    steps INTEGER CHECK (steps BETWEEN 0 AND 200000),
    active_minutes INTEGER CHECK (active_minutes BETWEEN 0 AND 1440),
    weight_kg NUMERIC(6, 2) CHECK (weight_kg BETWEEN 20 AND 500),
    sources JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_daily_metrics_user_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_user_date
    ON daily_metrics (user_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_is_deleted
    ON daily_metrics (is_deleted) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_daily_metrics_updated_at ON daily_metrics;
CREATE TRIGGER trg_daily_metrics_updated_at
    BEFORE UPDATE ON daily_metrics
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
