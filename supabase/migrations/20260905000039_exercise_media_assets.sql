-- Controlled administrator uploads for public exercise images and animations.
-- Binary data remains in PostgreSQL so the existing dump workflow backs it up.

CREATE TABLE IF NOT EXISTS exercise_media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id UUID NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
    idempotency_key UUID NOT NULL UNIQUE,
    field VARCHAR(20) NOT NULL CHECK (field IN ('animation_url', 'thumbnail_url')),
    mime_type VARCHAR(32) NOT NULL CHECK (
        mime_type IN ('image/gif', 'image/webp', 'image/png', 'image/jpeg')
        AND (field <> 'thumbnail_url' OR mime_type <> 'image/gif')
    ),
    size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 26214400),
    width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
    height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
    frame_count INTEGER NOT NULL CHECK (frame_count BETWEEN 1 AND 600),
    sha256 VARCHAR(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    media_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exercise_media_size_matches CHECK (size_bytes = octet_length(media_data)),
    CONSTRAINT exercise_thumbnail_size_limit CHECK (
        field <> 'thumbnail_url' OR size_bytes <= 5242880
    )
);

CREATE INDEX IF NOT EXISTS idx_exercise_media_assets_exercise_created
    ON exercise_media_assets (exercise_id, created_at DESC, id DESC);
