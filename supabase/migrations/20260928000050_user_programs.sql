-- Personal programs are visible only to their creator.
ALTER TABLE programs
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_programs_owner_current
    ON programs (owner_id, created_at DESC)
    WHERE owner_id IS NOT NULL AND is_deleted = FALSE;

ALTER TABLE programs
    DROP CONSTRAINT IF EXISTS programs_personal_not_template_check,
    ADD CONSTRAINT programs_personal_not_template_check
        CHECK (owner_id IS NULL OR is_template = FALSE);
