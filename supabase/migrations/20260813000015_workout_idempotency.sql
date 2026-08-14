-- Idempotent offline workout creation (QA-006).
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS client_workout_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workouts_user_client_id
    ON workouts (user_id, client_workout_id)
    WHERE client_workout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_client_workout_id
    ON workouts (client_workout_id)
    WHERE client_workout_id IS NOT NULL;
