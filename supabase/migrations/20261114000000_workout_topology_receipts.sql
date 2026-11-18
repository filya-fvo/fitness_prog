CREATE TABLE workout_topology_receipts (
    workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workout_id, operation_id)
);
