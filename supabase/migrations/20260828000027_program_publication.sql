-- Safe draft/version lifecycle for training programs.

ALTER TABLE programs
    ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS program_key TEXT,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users (id) ON DELETE SET NULL;

UPDATE programs
SET program_key = 'legacy-' || REPLACE(id::text, '-', '')
WHERE program_key IS NULL OR BTRIM(program_key) = '';

-- Only structurally usable legacy rows become visible after this migration.
UPDATE programs
SET publication_status = 'published',
    is_current = TRUE,
    published_at = COALESCE(updated_at, created_at, NOW())
WHERE is_deleted = FALSE
  AND jsonb_typeof(structure -> 'schedule') = 'array'
  AND jsonb_array_length(structure -> 'schedule') > 0
  AND CASE
      WHEN COALESCE(structure ->> 'days_per_week', '') ~ '^[1-7]$'
      THEN (structure ->> 'days_per_week')::INTEGER
      ELSE 0
  END
      = jsonb_array_length(structure -> 'schedule');

UPDATE programs
SET publication_status = 'draft',
    is_current = FALSE,
    published_at = NULL,
    published_by = NULL
WHERE publication_status <> 'published';

ALTER TABLE programs
    ALTER COLUMN program_key SET NOT NULL,
    ALTER COLUMN program_key SET DEFAULT (
        'custom-' || REPLACE(gen_random_uuid()::text, '-', '')
    );

ALTER TABLE programs
    DROP CONSTRAINT IF EXISTS programs_publication_status_check,
    ADD CONSTRAINT programs_publication_status_check
        CHECK (publication_status IN ('draft', 'published', 'archived')),
    DROP CONSTRAINT IF EXISTS programs_version_check,
    ADD CONSTRAINT programs_version_check CHECK (version > 0),
    DROP CONSTRAINT IF EXISTS programs_published_state_check,
    ADD CONSTRAINT programs_published_state_check CHECK (
        (publication_status = 'published' AND published_at IS NOT NULL)
        OR (publication_status <> 'published' AND is_current = FALSE)
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_programs_key_version
    ON programs (program_key, version);

CREATE UNIQUE INDEX IF NOT EXISTS uq_programs_current_version
    ON programs (program_key)
    WHERE is_current = TRUE AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_programs_public_catalog
    ON programs (workout_type, level, name)
    WHERE publication_status = 'published' AND is_current = TRUE AND is_deleted = FALSE;
