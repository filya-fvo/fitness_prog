-- Email login / link support
-- 1) Allow web-only users (no Telegram)
-- 2) Unique verified emails
-- 3) OTP codes stored as hashes only

ALTER TABLE users
    ALTER COLUMN telegram_id DROP NOT NULL;

-- Keep uniqueness for real Telegram ids; multiple NULLs are allowed in PostgreSQL UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_email_lower
    ON users (lower(auth_email))
    WHERE auth_email IS NOT NULL AND is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS email_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('login', 'link')),
    code_hash TEXT NOT NULL,
    user_id UUID NULL REFERENCES users (id) ON DELETE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_ip TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_otp_email_purpose
    ON email_otp_codes (lower(email), purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_otp_expires
    ON email_otp_codes (expires_at)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE email_otp_codes IS 'One-time codes for email login/link. Store only HMAC/SHA hashes, never plaintext.';
COMMENT ON COLUMN users.auth_email IS 'Verified email for web login (OTP). Unique among active users.';
