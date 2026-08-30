-- Sanitized history for the administrator system-status dashboard.

CREATE TABLE IF NOT EXISTS admin_system_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    overall_status VARCHAR(16) NOT NULL CHECK (
        overall_status IN ('normal', 'attention', 'error', 'no_data')
    ),
    item_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
    source VARCHAR(16) NOT NULL CHECK (source IN ('manual', 'scheduled')),
    CONSTRAINT ck_admin_system_snapshot_items_object CHECK (
        jsonb_typeof(item_statuses) = 'object'
    )
);

CREATE INDEX IF NOT EXISTS idx_admin_system_snapshots_captured
    ON admin_system_snapshots (captured_at DESC, id DESC);
