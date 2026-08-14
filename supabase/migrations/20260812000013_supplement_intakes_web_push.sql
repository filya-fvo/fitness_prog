-- Supplement intake tracking and browser Web Push subscriptions.

CREATE TABLE IF NOT EXISTS supplement_intakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supplement_entry_id TEXT NOT NULL,
    supplement_key TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    dose TEXT NOT NULL DEFAULT '',
    slot TEXT NOT NULL,
    days_mode TEXT NOT NULL DEFAULT 'every',
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'taken', 'skipped')),
    completed_at TIMESTAMPTZ,
    snoozed_until TIMESTAMPTZ,
    notified_at TIMESTAMPTZ,
    source TEXT CHECK (source IS NULL OR source IN ('telegram', 'web', 'app')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_supplement_intake_slot UNIQUE (user_id, supplement_entry_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_supplement_intakes_user_scheduled
    ON supplement_intakes (user_id, scheduled_at)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_supplement_intakes_due
    ON supplement_intakes (status, scheduled_at, snoozed_until)
    WHERE is_deleted = FALSE AND status = 'pending' AND notified_at IS NULL;

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    last_success_at TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 0,
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_active
    ON web_push_subscriptions (user_id)
    WHERE is_deleted = FALSE AND disabled_at IS NULL;

DROP TRIGGER IF EXISTS trg_supplement_intakes_updated_at ON supplement_intakes;
CREATE TRIGGER trg_supplement_intakes_updated_at
BEFORE UPDATE ON supplement_intakes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_web_push_subscriptions_updated_at ON web_push_subscriptions;
CREATE TRIGGER trg_web_push_subscriptions_updated_at
BEFORE UPDATE ON web_push_subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
