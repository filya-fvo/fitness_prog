BEGIN;

-- Migration 34 restricted the legacy summary column to regularity. Migration 36
-- made factors the canonical metric set, but did not widen this older guard.
-- Keep the column for backwards-compatible API responses while allowing every
-- value emitted by social_service.create_competition.
ALTER TABLE competitions
    DROP CONSTRAINT IF EXISTS competitions_metric_check;

ALTER TABLE competitions
    ADD CONSTRAINT competitions_metric_check
        CHECK (
            metric IN (
                'regularity',
                'weight_loss',
                'waist_reduction',
                'relative_strength',
                'custom'
            )
        );

COMMENT ON COLUMN competitions.metric IS
    'Legacy summary of factors; factors JSONB is canonical for custom competitions.';

COMMIT;
