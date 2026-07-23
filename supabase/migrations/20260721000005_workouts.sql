-- Stage 0: workouts + workout_sets (fitness-tz.md §4)

CREATE TABLE IF NOT EXISTS workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id),
    program_id UUID REFERENCES programs (id),
    scheduled_date DATE NOT NULL,
    status workout_status NOT NULL DEFAULT 'planned',
    ai_notes TEXT,
    rpe SMALLINT CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON workouts (user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_program_id ON workouts (program_id);
CREATE INDEX IF NOT EXISTS idx_workouts_scheduled_date ON workouts (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workouts_status ON workouts (status);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts (user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workouts_is_deleted ON workouts (is_deleted) WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS workout_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises (id),
    set_number INTEGER NOT NULL CHECK (set_number > 0),
    reps INTEGER CHECK (reps IS NULL OR reps >= 0),
    weight NUMERIC(8, 2) CHECK (weight IS NULL OR weight >= 0),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    rest_time_sec INTEGER CHECK (rest_time_sec IS NULL OR rest_time_sec >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (workout_id, exercise_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_workout_sets_workout_id ON workout_sets (workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_id ON workout_sets (exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_is_deleted ON workout_sets (is_deleted) WHERE is_deleted = FALSE;
