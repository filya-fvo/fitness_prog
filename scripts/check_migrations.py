"""Static validation of Stage 0 SQL migrations (no DB required)."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"

REQUIRED_FILES = [
    "20260721000000_extensions.sql",
    "20260721000001_enums.sql",
    "20260721000002_users.sql",
    "20260721000003_exercises.sql",
    "20260721000004_programs.sql",
    "20260721000005_workouts.sql",
    "20260721000006_nutrition.sql",
    "20260721000007_ai_conversations.sql",
    "20260721000008_updated_at_triggers.sql",
    "20260722000009_production_upgrade_p0.sql",
    "20260726000010_email_auth.sql",
    "20260810000011_workout_set_details.sql",
    "20260811000012_openai_user_conversations.sql",
    "20260812000013_supplement_intakes_web_push.sql",
    "20260812000014_workout_set_weight_mode.sql",
    "20260813000015_workout_idempotency.sql",
    "20260813000016_account_merge.sql",
    "20260815000017_daily_metrics.sql",
    "20260815000018_body_measurements.sql",
    "20260820000019_plank_animation.sql",
    "20260820000020_normalize_nutrition_product_names.sql",
    "20260823000021_restore_local_embedding_to_vector.sql",
    "20260824000022_workout_plan_overrides.sql",
    "20260826000023_admin_audit_log.sql",
    "20260827000024_admin_broadcasts.sql",
]

REQUIRED_TABLES = [
    "users",
    "exercises",
    "programs",
    "workouts",
    "workout_sets",
    "nutrition_products",
    "nutrition_logs",
    "ai_conversations",
    "email_otp_codes",
    "supplement_intakes",
    "web_push_subscriptions",
    "daily_metrics",
    "body_measurements",
    "workout_plan_overrides",
    "admin_audit_log",
    "admin_broadcasts",
    "admin_broadcast_deliveries",
]

REQUIRED_SNIPPETS = [
    "CREATE EXTENSION IF NOT EXISTS \"vector\"",
    "CREATE EXTENSION IF NOT EXISTS \"pg_trgm\"",
    "embedding vector(1536)",
    "gin_trgm_ops",
    "created_at",
    "updated_at",
    "is_deleted",
    "set_updated_at",
    "machine_params JSONB",
    "weight_mode TEXT",
    "client_workout_id UUID",
    "uq_workouts_user_client_id",
    "merged_into_user_id UUID",
    "uq_daily_metrics_user_date",
    "uq_body_measurements_user_date",
    "/exercise-gifs/2135-VBAWRPG.gif",
    "ALTER COLUMN embedding TYPE vector(1536)",
    "cardinality(embedding) <> 1536",
    "uq_workout_plan_overrides_slot",
    "ck_workout_plan_overrides_replacements_array",
    "prevent_admin_audit_mutation",
    "trg_admin_audit_immutable",
    "idempotency_key UUID NOT NULL UNIQUE",
    "uq_admin_broadcast_delivery_user",
]


def main() -> int:
    missing_files = [name for name in REQUIRED_FILES if not (MIGRATIONS / name).exists()]
    if missing_files:
        raise SystemExit(f"Missing migration files: {missing_files}")

    combined = "\n".join((MIGRATIONS / name).read_text(encoding="utf-8") for name in REQUIRED_FILES)

    missing_tables = [table for table in REQUIRED_TABLES if f"CREATE TABLE IF NOT EXISTS {table}" not in combined]
    if missing_tables:
        raise SystemExit(f"Missing tables: {missing_tables}")

    missing_snippets = [snippet for snippet in REQUIRED_SNIPPETS if snippet not in combined]
    if missing_snippets:
        raise SystemExit(f"Missing SQL snippets: {missing_snippets}")

    print("migration_files=", len(REQUIRED_FILES))
    print("tables_ok=", REQUIRED_TABLES)
    print("STAGE0_MIGRATIONS_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
