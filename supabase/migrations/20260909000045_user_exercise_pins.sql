-- Cross-device exercise pins used by the PLUS progress explorer.
CREATE TABLE IF NOT EXISTS user_exercise_pins (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_user_exercise_pins_exercise
    ON user_exercise_pins (exercise_id);
