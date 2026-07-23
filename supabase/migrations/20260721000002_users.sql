-- Stage 0: users table (fitness-tz.md §4)
-- Required audit fields: created_at, updated_at, is_deleted

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL UNIQUE,
    username TEXT,
    auth_email TEXT,
    anthropometry JSONB NOT NULL DEFAULT '{}'::jsonb,
    goals JSONB NOT NULL DEFAULT '{}'::jsonb,
    subscription_status subscription_status NOT NULL DEFAULT 'free',
    stars_balance INTEGER NOT NULL DEFAULT 0 CHECK (stars_balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users (is_deleted) WHERE is_deleted = FALSE;

COMMENT ON COLUMN users.anthropometry IS 'JSONB: weight, height, age and related metrics';
COMMENT ON COLUMN users.goals IS 'JSONB: training/nutrition goals from onboarding';
