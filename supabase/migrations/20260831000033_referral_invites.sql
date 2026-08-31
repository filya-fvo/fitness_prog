-- Hashed referral invitations with explicit acceptance and attribution.

CREATE TABLE IF NOT EXISTS invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    purpose VARCHAR(16) NOT NULL DEFAULT 'referral' CHECK (purpose IN ('referral', 'friend', 'challenge')),
    token_hash VARCHAR(64) NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
    code_hash VARCHAR(64) NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 20 CHECK (max_uses BETWEEN 1 AND 100),
    use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count BETWEEN 0 AND max_uses),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id UUID NOT NULL REFERENCES invites (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    stage VARCHAR(16) NOT NULL DEFAULT 'accepted' CHECK (stage IN ('opened', 'registered', 'accepted')),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invite_redemption_user UNIQUE (invite_id, user_id)
);

CREATE TABLE IF NOT EXISTS referral_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id UUID NOT NULL REFERENCES invites (id) ON DELETE RESTRICT,
    inviter_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    referred_user_id UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (inviter_user_id <> referred_user_id)
);

CREATE TABLE IF NOT EXISTS invite_lookup_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_inviter_created
    ON invites (inviter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invites_active_expiry
    ON invites (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_user
    ON invite_redemptions (user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_inviter
    ON referral_attributions (inviter_user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_lookup_attempts_user_time
    ON invite_lookup_attempts (user_id, attempted_at DESC);

DROP TRIGGER IF EXISTS trg_invites_updated_at ON invites;
CREATE TRIGGER trg_invites_updated_at
    BEFORE UPDATE ON invites
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
