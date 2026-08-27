-- Safe administrator Telegram broadcast campaigns and per-recipient delivery state.

CREATE TABLE IF NOT EXISTS admin_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    title VARCHAR(80) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
    message_text TEXT NOT NULL CHECK (char_length(message_text) BETWEEN 1 AND 3000),
    audience JSONB NOT NULL DEFAULT '{}'::jsonb,
    audience_count INTEGER NOT NULL DEFAULT 0 CHECK (audience_count >= 0),
    status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'tested', 'scheduled', 'sending', 'completed', 'cancelled')
    ),
    content_hash VARCHAR(64) NOT NULL CHECK (char_length(content_hash) = 64),
    idempotency_key UUID NOT NULL UNIQUE,
    correlation_id UUID NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    tested_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_admin_broadcast_audience_object CHECK (jsonb_typeof(audience) = 'object')
);

CREATE TABLE IF NOT EXISTS admin_broadcast_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES admin_broadcasts (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    telegram_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'sending', 'sent', 'failed', 'skipped')
    ),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error_code VARCHAR(40),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_admin_broadcast_delivery_user UNIQUE (broadcast_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_broadcast_created
    ON admin_broadcasts (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_broadcast_status_schedule
    ON admin_broadcasts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_admin_broadcast_delivery_campaign_status
    ON admin_broadcast_deliveries (broadcast_id, status, created_at);

DROP TRIGGER IF EXISTS trg_admin_broadcasts_updated_at ON admin_broadcasts;
CREATE TRIGGER trg_admin_broadcasts_updated_at
    BEFORE UPDATE ON admin_broadcasts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_admin_broadcast_deliveries_updated_at ON admin_broadcast_deliveries;
CREATE TRIGGER trg_admin_broadcast_deliveries_updated_at
    BEFORE UPDATE ON admin_broadcast_deliveries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
