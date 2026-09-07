-- Separate the domain workout schedule from reminder delivery preferences.
-- Legacy fields stay in place for deployed clients; runtime code keeps them mirrored.
UPDATE users
SET goals = jsonb_set(
    COALESCE(goals, '{}'::jsonb),
    '{workout_schedule}',
    jsonb_build_object(
        'version', 1,
        'days', CASE
            WHEN jsonb_typeof(COALESCE(goals, '{}'::jsonb) #> '{notification_settings,workouts,days}') = 'array'
                THEN COALESCE(goals, '{}'::jsonb) #> '{notification_settings,workouts,days}'
            WHEN jsonb_typeof(COALESCE(goals, '{}'::jsonb) -> 'workout_days') = 'array'
                THEN COALESCE(goals, '{}'::jsonb) -> 'workout_days'
            ELSE '[0, 2, 4]'::jsonb
        END,
        'start_time', COALESCE(
            NULLIF(COALESCE(goals, '{}'::jsonb) #>> '{notification_settings,workouts,time}', ''),
            NULLIF(COALESCE(goals, '{}'::jsonb) ->> 'workout_start_time', ''),
            '18:30'
        )
    ),
    true
)
WHERE is_deleted IS FALSE
  AND NOT (COALESCE(goals, '{}'::jsonb) ? 'workout_schedule');
