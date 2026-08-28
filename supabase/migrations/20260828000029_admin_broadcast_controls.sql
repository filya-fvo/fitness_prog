-- Cancellation, explicit scheduling timezone and terminal recipient state.

ALTER TABLE admin_broadcasts
    ADD COLUMN IF NOT EXISTS scheduled_timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE admin_broadcast_deliveries
    DROP CONSTRAINT IF EXISTS admin_broadcast_deliveries_status_check;

ALTER TABLE admin_broadcast_deliveries
    ADD CONSTRAINT admin_broadcast_deliveries_status_check CHECK (
        status IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')
    );
