-- Nutrition reset and account deletion must remain possible after a correction request.
ALTER TABLE nutrition_corrections
    DROP CONSTRAINT IF EXISTS nutrition_corrections_source_log_id_fkey;
ALTER TABLE nutrition_corrections
    ADD CONSTRAINT nutrition_corrections_source_log_id_fkey
    FOREIGN KEY (source_log_id) REFERENCES nutrition_logs(id) ON DELETE CASCADE;

ALTER TABLE nutrition_corrections
    DROP CONSTRAINT IF EXISTS nutrition_corrections_user_id_fkey;
ALTER TABLE nutrition_corrections
    ADD CONSTRAINT nutrition_corrections_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE nutrition_corrections
    DROP CONSTRAINT IF EXISTS nutrition_corrections_reviewed_by_user_id_fkey;
ALTER TABLE nutrition_corrections
    ADD CONSTRAINT nutrition_corrections_reviewed_by_user_id_fkey
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
