-- Stage 0: ai_conversations (fitness-tz.md §4)

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id),
    session_id UUID NOT NULL,
    role ai_message_role NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_session_id ON ai_conversations (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_session
    ON ai_conversations (user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_timestamp ON ai_conversations (timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_is_deleted
    ON ai_conversations (is_deleted) WHERE is_deleted = FALSE;
