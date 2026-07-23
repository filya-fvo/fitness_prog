#!/usr/bin/env sh
# Apply SQL migrations inside docker network (psql client container).
# Usage:
#   DATABASE_URL_SYNC=postgresql://postgres:postgres@db:5432/fitness \
#   sh scripts/apply_migrations_docker.sh

set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
URL="${DATABASE_URL_SYNC:-postgresql://postgres:postgres@db:5432/fitness}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found; run via: docker run --rm -v \"$ROOT:/work\" -w /work --network <compose_net> postgres:16-alpine sh scripts/apply_migrations_docker.sh"
  exit 1
fi

for f in $(ls "$MIG"/*.sql | sort); do
  echo "APPLY $f"
  psql "$URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "MIGRATIONS_OK"
