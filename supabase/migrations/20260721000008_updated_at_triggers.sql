-- Stage 0: auto-update updated_at on row changes

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users',
        'exercises',
        'programs',
        'workouts',
        'workout_sets',
        'nutrition_products',
        'nutrition_logs',
        'ai_conversations'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', tbl, tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION set_updated_at()',
            tbl,
            tbl
        );
    END LOOP;
END
$$;
