-- Immutable journal of privileged administrator actions.

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
    action VARCHAR(80) NOT NULL,
    object_type VARCHAR(40) NOT NULL,
    object_id UUID,
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failure')),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 300),
    before_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    notification_status VARCHAR(24) CHECK (
        notification_status IS NULL OR notification_status IN (
            'pending', 'sent', 'failed', 'not_requested', 'unavailable'
        )
    ),
    correlation_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_admin_audit_before_object CHECK (jsonb_typeof(before_data) = 'object'),
    CONSTRAINT ck_admin_audit_after_object CHECK (jsonb_typeof(after_data) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at
    ON admin_audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created
    ON admin_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created
    ON admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_result_created
    ON admin_audit_log (result, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_object
    ON admin_audit_log (object_type, object_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_admin_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_immutable ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_immutable
    BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_mutation();
