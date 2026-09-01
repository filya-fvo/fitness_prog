-- Opt-in pseudonymous global regularity seasons.

CREATE TABLE IF NOT EXISTS global_competition_seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_key VARCHAR(40) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    metric VARCHAR(32) NOT NULL DEFAULT 'regularity' CHECK (metric = 'regularity'),
    status VARCHAR(16) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'finished', 'cancelled')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    join_deadline DATE NOT NULL,
    algorithm_version VARCHAR(32) NOT NULL DEFAULT 'regularity_global_v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date = start_date + 27),
    CHECK (join_deadline BETWEEN start_date AND end_date)
);

CREATE TABLE IF NOT EXISTS global_competition_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES global_competition_seasons (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    public_alias VARCHAR(32) NOT NULL,
    cohort VARCHAR(16) NOT NULL CHECK (cohort IN ('days_1_2', 'days_3', 'days_4_plus')),
    consented_at TIMESTAMPTZ NOT NULL,
    schedule_days JSONB NOT NULL DEFAULT '[]'::jsonb,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
    ranked_eligible BOOLEAN NOT NULL DEFAULT TRUE,
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_global_participant_user UNIQUE (season_id, user_id),
    CONSTRAINT uq_global_participant_alias UNIQUE (season_id, public_alias),
    CHECK (jsonb_typeof(schedule_days) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_global_seasons_status_dates
    ON global_competition_seasons (status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_global_participants_cohort
    ON global_competition_participants (season_id, cohort)
    WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_global_participants_user
    ON global_competition_participants (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_global_competition_seasons_updated_at
    ON global_competition_seasons;
CREATE TRIGGER trg_global_competition_seasons_updated_at
    BEFORE UPDATE ON global_competition_seasons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
