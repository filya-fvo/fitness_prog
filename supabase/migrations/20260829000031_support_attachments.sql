-- Authenticated screenshots attached to support messages. Binary data remains
-- in PostgreSQL so the existing encrypted/off-site dump workflow includes it.

CREATE TABLE IF NOT EXISTS support_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES support_messages (id) ON DELETE CASCADE,
    idempotency_key UUID NOT NULL UNIQUE,
    mime_type VARCHAR(32) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
    image_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_attachments_message_created
    ON support_attachments (message_id, created_at ASC, id ASC);
