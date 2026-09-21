ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS media_review_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS media_review_reason TEXT;

UPDATE exercises
SET media_review_status = CASE
        WHEN tags @> '["media:no-exact-gif"]'::jsonb THEN 'rejected'
        WHEN tags @> '["media:verified"]'::jsonb THEN 'verified'
        ELSE 'pending'
    END,
    media_review_reason = CASE
        WHEN tags @> '["media:no-exact-gif"]'::jsonb
            THEN COALESCE(media_review_reason, 'В каталоге нет точного проверенного GIF.')
        ELSE NULL
    END;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'exercises_media_review_status_check'
    ) THEN
        ALTER TABLE exercises
            ADD CONSTRAINT exercises_media_review_status_check
            CHECK (media_review_status IN ('pending', 'verified', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercises_media_review_status
    ON exercises (media_review_status)
    WHERE is_deleted = FALSE;
