#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/vps}"
STATUS_DIR="${ADMIN_SYSTEM_STATUS_DIR_HOST:-/opt/fitness/status}"

case "$STATUS_DIR" in
  /opt/fitness/status) ;;
  *) echo "ADMIN_SYSTEM_STATUS_DIR_HOST must be /opt/fitness/status" >&2; exit 2 ;;
esac

write_backup_status() {
  result="$1"
  completed_at="${2:-}"
  install -d -m 0755 "$STATUS_DIR"
  status_tmp="$(mktemp "$STATUS_DIR/backup.XXXXXX")"
  if [ -n "$completed_at" ]; then
    printf '{"status":"%s","completed_at":"%s","recorded_at":"%s"}\n' \
      "$result" "$completed_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$status_tmp"
  else
    printf '{"status":"%s","recorded_at":"%s"}\n' \
      "$result" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$status_tmp"
  fi
  chmod 0644 "$status_tmp"
  mv "$status_tmp" "$STATUS_DIR/backup.json"
}

backup_finished=0
temporary=""
on_exit() {
  exit_code="$?"
  trap - EXIT
  if [ -n "$temporary" ]; then
    rm -f "$temporary"
  fi
  if [ "$backup_finished" -ne 1 ] && [ "$exit_code" -ne 0 ]; then
    write_backup_status error || true
  fi
  exit "$exit_code"
}
trap on_exit EXIT
trap 'exit 1' HUP INT TERM

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

compose exec -T db sh -ec \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$temporary"

test -s "$temporary"
compose exec -T db pg_restore --list < "$temporary" > /dev/null
mv "$temporary" "$target"
sha256sum "$target" > "$target.sha256"
completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
write_backup_status ok "$completed_at"
backup_finished=1
trap - EXIT HUP INT TERM

echo "BACKUP_OK $target"
