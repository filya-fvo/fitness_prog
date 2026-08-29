-- Durable in-app support tickets and threaded messages.

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    category VARCHAR(20) NOT NULL CHECK (category IN ('bug', 'question', 'idea', 'other')),
    status VARCHAR(24) NOT NULL DEFAULT 'waiting_support' CHECK (
        status IN ('waiting_support', 'waiting_user', 'resolved', 'closed')
    ),
    subject VARCHAR(120) NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 120),
    source_page VARCHAR(300),
    client VARCHAR(40) NOT NULL DEFAULT 'browser',
    app_version VARCHAR(80),
    idempotency_key UUID NOT NULL UNIQUE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    admin_last_read_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
    author_type VARCHAR(16) NOT NULL CHECK (author_type IN ('user', 'admin', 'system')),
    author_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3500),
    idempotency_key UUID NOT NULL UNIQUE,
    delivery_channel VARCHAR(20) NOT NULL DEFAULT 'in_app' CHECK (
        delivery_channel IN ('in_app', 'telegram')
    ),
    delivery_status VARCHAR(24) NOT NULL DEFAULT 'not_requested' CHECK (
        delivery_status IN ('pending', 'sent', 'failed', 'not_requested', 'unavailable')
    ),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated
    ON support_tickets (user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_last_message
    ON support_tickets (status, last_message_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
    ON support_messages (ticket_id, created_at ASC, id ASC);

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
