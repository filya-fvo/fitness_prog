-- Short-lived hashed native Telegram challenge; no JWT/raw link or verifier stored.
CREATE TABLE android_login_requests (
 id uuid PRIMARY KEY,
 link_hash varchar(64) NOT NULL UNIQUE,
 challenge varchar(64) NOT NULL,
 source_hash varchar(64) NOT NULL,
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 telegram_id bigint,
 actor json,
 approved_at timestamptz,
 consumed_at timestamptz
);
CREATE INDEX ix_android_login_requests_source_hash ON android_login_requests(source_hash);
CREATE INDEX ix_android_login_requests_expires_at ON android_login_requests(expires_at);
