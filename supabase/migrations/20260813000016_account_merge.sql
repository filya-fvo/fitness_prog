-- Browser-first registration and auditable Telegram/email account merging.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS merged_into_user_id UUID NULL REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_users_merged_into
    ON users (merged_into_user_id)
    WHERE merged_into_user_id IS NOT NULL;

COMMENT ON COLUMN users.merged_into_user_id IS
    'Surviving account after an explicit verified merge; source row remains soft-deleted for audit.';
