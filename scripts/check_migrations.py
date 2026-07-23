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
