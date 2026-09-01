-- Consent-based friendships and private regularity competitions.

ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_purpose_check;
ALTER TABLE invites
    ADD CONSTRAINT invites_purpose_check
    CHECK (purpose IN ('referral', 'referral_social', 'friend', 'challenge'));

CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_low_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    user_high_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    initiated_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL DEFAULT 'accepted'
        CHECK (status IN ('accepted', 'removed', 'blocked')),
    accepted_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    blocked_at TIMESTAMPTZ,
    blocked_by_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_friendship_pair UNIQUE (user_low_id, user_high_id),
    CHECK (user_low_id < user_high_id),
    CHECK (initiated_by_user_id IN (user_low_id, user_high_id)),
    CHECK (blocked_by_user_id IS NULL OR blocked_by_user_id IN (user_low_id, user_high_id))
);

CREATE TABLE IF NOT EXISTS competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    friendship_id UUID NOT NULL REFERENCES friendships (id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    kind VARCHAR(16) NOT NULL DEFAULT 'friend' CHECK (kind = 'friend'),
    metric VARCHAR(32) NOT NULL DEFAULT 'regularity' CHECK (metric = 'regularity'),
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
    duration_days INTEGER NOT NULL DEFAULT 14 CHECK (duration_days IN (14, 28)),
    start_date DATE,
    end_date DATE,
    algorithm_version VARCHAR(32) NOT NULL DEFAULT 'regularity_v1',
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS competition_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    consented_at TIMESTAMPTZ,
    schedule_days JSONB NOT NULL DEFAULT '[]'::jsonb,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_competition_participant UNIQUE (competition_id, user_id),
    CHECK (jsonb_typeof(schedule_days) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_friendships_low_status
    ON friendships (user_low_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_high_status
    ON friendships (user_high_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_competitions_open_friendship
    ON competitions (friendship_id) WHERE status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS idx_competitions_status_end
    ON competitions (status, end_date);
CREATE INDEX IF NOT EXISTS idx_competition_participants_user
    ON competition_participants (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_friendships_updated_at ON friendships;
CREATE TRIGGER trg_friendships_updated_at
    BEFORE UPDATE ON friendships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_competitions_updated_at ON competitions;
CREATE TRIGGER trg_competitions_updated_at
    BEFORE UPDATE ON competitions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
