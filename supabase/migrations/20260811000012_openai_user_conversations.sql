-- One isolated OpenAI Responses conversation per application user.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS openai_conversation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_openai_conversation_id
    ON users (openai_conversation_id)
    WHERE openai_conversation_id IS NOT NULL;
