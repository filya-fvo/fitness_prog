-- Independent FREE / PLUS access grants. Entitlements become the access source of truth.
CREATE TABLE IF NOT EXISTS user_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    source VARCHAR(32) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    external_reference VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_user_entitlements_code CHECK (code IN ('plus')),
    CONSTRAINT ck_user_entitlements_source CHECK (
        source IN (
            'beta_grant', 'legacy_stars', 'admin', 'qa', 'telegram_stars',
            'web_payment', 'corporate', 'promo', 'partner'
        )
    ),
    CONSTRAINT ck_user_entitlements_time_window CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT ck_user_entitlements_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_user
    ON user_entitlements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_active
    ON user_entitlements (user_id, code, starts_at, ends_at)
    WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_entitlements_external_reference
    ON user_entitlements (source, external_reference)
    WHERE external_reference IS NOT NULL;

DROP TRIGGER IF EXISTS trg_user_entitlements_updated_at ON user_entitlements;
CREATE TRIGGER trg_user_entitlements_updated_at
    BEFORE UPDATE ON user_entitlements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Preserve stronger legacy access before responses start using entitlements.
INSERT INTO user_entitlements (user_id, code, source, starts_at, metadata)
SELECT
    users.id,
    'plus',
    'legacy_stars',
    NOW(),
    jsonb_build_object('migrated_from', 'subscription_status')
FROM users
WHERE users.is_deleted IS FALSE
  AND users.merged_into_user_id IS NULL
  AND users.subscription_status = 'pro_stars'
  AND NOT EXISTS (
      SELECT 1
      FROM user_entitlements existing
      WHERE existing.user_id = users.id
        AND existing.code = 'plus'
        AND existing.source = 'legacy_stars'
  );
