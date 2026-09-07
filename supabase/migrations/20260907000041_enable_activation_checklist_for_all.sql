-- Make the optional activation checklist available to every active account.
-- Existing state is immutable here so completed/dismissed users are never reset.
UPDATE users
SET goals = jsonb_set(
    COALESCE(goals, '{}'::jsonb),
    '{activation_checklist}',
    jsonb_build_object(
        'version', 1,
        'started_at', to_char(
            CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'signals', '[]'::jsonb,
        'snoozed_until', NULL,
        'completed_at', NULL,
        'dismissed_at', NULL
    ),
    true
)
WHERE is_deleted IS FALSE
  AND NOT (COALESCE(goals, '{}'::jsonb) ? 'activation_checklist');
