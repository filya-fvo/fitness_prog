-- Dry-run only: exercise/program copies shadow public tables until rollback.
-- Run with psql -v ON_ERROR_STOP=1 from the repository root before deployment.
BEGIN;
CREATE TEMP TABLE exercises AS SELECT * FROM public.exercises;
CREATE TEMP TABLE programs AS SELECT * FROM public.programs;
CREATE TEMP TABLE exercise_images_before AS SELECT * FROM exercises;

\i supabase/migrations/20261001000051_rename_cable_crunch_molitva.sql
\i supabase/migrations/20261001000052_approved_exercise_images.sql

DO $$
BEGIN
    IF (SELECT count(*) FROM exercises WHERE NOT is_deleted AND image_url LIKE '/exercise-images/%.webp') <> 134 THEN
        RAISE EXCEPTION 'Approved package does not match all 134 production exercises';
    END IF;
    IF EXISTS (
        SELECT 1 FROM exercises after JOIN exercise_images_before before USING (id)
        WHERE after.animation_url IS DISTINCT FROM before.animation_url
            OR after.video_url IS DISTINCT FROM before.video_url
            OR after.is_deleted IS DISTINCT FROM before.is_deleted
    ) THEN
        RAISE EXCEPTION 'Release modified an existing animation, video or lifecycle';
    END IF;
    IF (SELECT count(*) FROM exercises) <> (SELECT count(*) FROM exercise_images_before) THEN
        RAISE EXCEPTION 'Release changed the catalogue size';
    END IF;
END $$;
SELECT count(*) AS approved_images_dry_run FROM exercises WHERE NOT is_deleted AND image_url IS NOT NULL;
ROLLBACK;
