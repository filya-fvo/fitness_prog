-- Account-scoped Android feed; canonical diary tables remain unchanged.
CREATE TABLE IF NOT EXISTS android_sync_cursors (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision >= 0)
);
CREATE TABLE IF NOT EXISTS android_sync_entities (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('workout','nutrition_log','measurement','product')),
 entity_id text NOT NULL,
 revision bigint NOT NULL,
 fingerprint text NOT NULL,
 deleted boolean NOT NULL DEFAULT false,
 payload jsonb NOT NULL,
 day date,
 PRIMARY KEY(user_id,kind,entity_id)
);
CREATE TABLE IF NOT EXISTS android_sync_events (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 revision bigint NOT NULL,
 kind text NOT NULL,
 entity_id text NOT NULL,
 deleted boolean NOT NULL,
 payload jsonb NOT NULL,
 day date,
 PRIMARY KEY(user_id,revision)
);
CREATE TABLE IF NOT EXISTS android_sync_receipts (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL,
 fingerprint text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,operation_id)
);
