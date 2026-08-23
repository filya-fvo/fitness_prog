#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/vps}"

compose() {
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" "$@"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env: $ENV_FILE" >&2
  exit 2
fi

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/fitness-$stamp.dump"
temporary="$target.partial"

trap 'rm -f "$temporary"' EXIT HUP INT TERM

compose exec -T db sh -ec \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$temporary"

test -s "$temporary"
compose exec -T db pg_restore --list < "$temporary" > /dev/null
mv "$temporary" "$target"
sha256sum "$target" > "$target.sha256"
trap - EXIT HUP INT TERM

echo "BACKUP_OK $target"
