-- Give every active account effective PLUS access during the beta period.
-- Re-running this migration does not duplicate an already active grant.

-- Keep a durable entitlement for accounts that used the legacy paid status.
INSERT INTO user_entitlements (user_id, code, source, starts_at, metadata)
SELECT
    users.id,
    'plus',
    'legacy_stars',
    NOW(),
    jsonb_build_object('migrated_from', 'subscription_status')
FROM users
WHERE users.is_deleted IS FALSE
  AND users.merged_into_user_id IS NULL
  AND users.subscription_status = 'pro_stars'
  AND NOT EXISTS (
      SELECT 1
      FROM user_entitlements existing
      WHERE existing.user_id = users.id
        AND existing.code = 'plus'
        AND existing.source = 'legacy_stars'
  );

-- Only effectively FREE accounts receive the temporary beta grant. Existing
-- paid, corporate, administrative or legacy access remains the stronger source.
INSERT INTO user_entitlements (user_id, code, source, starts_at, metadata)
SELECT
    users.id,
    'plus',
    'beta_grant',
    NOW(),
    jsonb_build_object('grant_kind', 'existing_user_rollout')
FROM users
WHERE users.is_deleted IS FALSE
  AND users.merged_into_user_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM user_entitlements active_access
      WHERE active_access.user_id = users.id
        AND active_access.code = 'plus'
        AND active_access.starts_at <= NOW()
        AND active_access.revoked_at IS NULL
        AND (active_access.ends_at IS NULL OR active_access.ends_at > NOW())
  );
