-- One checked APK release, one immutable announcement, one receipt per account.
CREATE TABLE release_notices (
    id uuid PRIMARY KEY,
    release_key varchar(80) NOT NULL UNIQUE,
    content_hash varchar(64) NOT NULL,
    actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title varchar(80) NOT NULL,
    message_text text NOT NULL,
    apk_url text NOT NULL,
    apk_version integer NOT NULL UNIQUE CHECK (apk_version > 0),
    apk_sha256 varchar(64) NOT NULL UNIQUE,
    source_commit varchar(40) NOT NULL,
    shared_commit varchar(40) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE release_notice_receipts (
    notice_id uuid NOT NULL REFERENCES release_notices(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    channel varchar(16) NOT NULL CONSTRAINT release_notice_channel CHECK (channel IN ('telegram','browser','android')),
    status varchar(20) NOT NULL CONSTRAINT release_notice_status CHECK (status IN ('pending','awaiting_open','sending','sent','partial','unknown','unavailable','skipped','seen')),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    attempted_at timestamptz,
    delivered_at timestamptz,
    seen_at timestamptz,
    error_code varchar(40),
    PRIMARY KEY (notice_id, user_id)
);
CREATE INDEX ix_release_notice_receipts_next_attempt_at ON release_notice_receipts(next_attempt_at)
    WHERE status IN ('pending','awaiting_open','sending');

CREATE INDEX ix_release_notice_receipts_unread ON release_notice_receipts(user_id) WHERE seen_at IS NULL;
