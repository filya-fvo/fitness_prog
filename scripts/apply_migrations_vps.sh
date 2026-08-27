#!/bin/sh
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
WEIGHT_MIGRATION="20260827000025_move_weight_to_body_measurements.sql"

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS fitness_schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

is_applied() {
  migration_name="$1"
  result="$(psql -At -v ON_ERROR_STOP=1 -v migration="$migration_name" <<'SQL'
SELECT EXISTS (
    SELECT 1
    FROM fitness_schema_migrations
    WHERE filename = :'migration'
);
SQL
)"
  [ "$result" = "t" ]
}

record_applied() {
  migration_name="$1"
  psql -v ON_ERROR_STOP=1 -v migration="$migration_name" <<'SQL'
INSERT INTO fitness_schema_migrations (filename)
VALUES (:'migration')
ON CONFLICT (filename) DO NOTHING;
SQL
}

column_exists() {
  table_name="$1"
  column_name="$2"
  result="$(psql -At -v ON_ERROR_STOP=1 -v table_name="$table_name" -v column_name="$column_name" <<'SQL'
SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = :'table_name'
      AND column_name = :'column_name'
);
SQL
)"
  [ "$result" = "t" ]
}

bootstrap="$MIGRATIONS_DIR/20260823000021_restore_local_embedding_to_vector.sql"
if [ -f "$bootstrap" ]; then
  echo "PREPARE $bootstrap"
  psql -v ON_ERROR_STOP=1 --single-transaction -f "$bootstrap"
fi

find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort | while IFS= read -r file; do
  [ "$file" = "$bootstrap" ] && continue
  filename="$(basename "$file")"

  if is_applied "$filename"; then
    echo "SKIP $file"
    continue
  fi

  # This migration predates the ledger and removes its own source column. On an
  # existing installation, that final state proves the data move already ran.
  if [ "$filename" = "$WEIGHT_MIGRATION" ] \
    && ! column_exists daily_metrics weight_kg \
    && column_exists body_measurements weight_kg; then
    echo "RECORD_ALREADY_APPLIED $file"
    record_applied "$filename"
    continue
  fi

  echo "APPLY $file"
  psql -v ON_ERROR_STOP=1 --single-transaction -f "$file"
  record_applied "$filename"
done

echo "MIGRATIONS_OK"
