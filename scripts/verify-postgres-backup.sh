#!/usr/bin/env bash
set -euo pipefail

project_dir="${PROJECT_DIR:-/opt/fitness/source}"
backup_root="${BACKUP_ROOT:-/opt/fitness/backups}"
dump_path="${1:-}"
restore_image="${RESTORE_IMAGE:-pgvector/pgvector:0.8.6-pg18-bookworm}"

if [[ -z "${dump_path}" ]]; then
  echo "Usage: $0 /opt/fitness/backups/fitness-TIMESTAMP.dump" >&2
  exit 2
fi

if [[ ! -d "${project_dir}/supabase/migrations" || ! -r "${project_dir}/scripts/apply_migrations_vps.sh" ]]; then
  echo "Project migrations are not readable under ${project_dir}." >&2
  exit 2
fi

resolved_backup_root="$(readlink -f -- "${backup_root}")"
resolved_dump="$(readlink -f -- "${dump_path}")"
case "${resolved_dump}" in
  "${resolved_backup_root}"/*.dump) ;;
  *)
    echo "Refusing backup outside ${resolved_backup_root}: ${resolved_dump}" >&2
    exit 2
    ;;
esac

if [[ ! -s "${resolved_dump}" ]]; then
  echo "Backup is missing or empty: ${resolved_dump}" >&2
  exit 2
fi

if ! docker image inspect "${restore_image}" >/dev/null 2>&1; then
  echo "Restore image is not available locally: ${restore_image}" >&2
  exit 2
fi

suffix="$(date -u +%Y%m%d%H%M%S)-$$"
container="fitness-restore-verify-${suffix}"
volume="fitness-restore-verify-${suffix}-data"
counts_file="$(mktemp)"
audit_error="$(mktemp)"

cleanup() {
  exit_code="$?"
  trap - EXIT HUP INT TERM
  case "${container}" in
    fitness-restore-verify-*) docker rm -f "${container}" >/dev/null 2>&1 || true ;;
    *) echo "Unsafe temporary container name: ${container}" >&2 ;;
  esac
  case "${volume}" in
    fitness-restore-verify-*-data) docker volume rm "${volume}" >/dev/null 2>&1 || true ;;
    *) echo "Unsafe temporary volume name: ${volume}" >&2 ;;
  esac
  rm -f -- "${counts_file}" "${audit_error}"
  exit "${exit_code}"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

if [[ -r "${resolved_dump}.sha256" ]]; then
  sha256sum --check "${resolved_dump}.sha256" >/dev/null
fi

docker volume create "${volume}" >/dev/null
restore_password="restore-${suffix}"
docker run --detach \
  --name "${container}" \
  --network none \
  --env POSTGRES_USER=fitness_restore \
  --env POSTGRES_PASSWORD="${restore_password}" \
  --env POSTGRES_DB=fitness_restore \
  --volume "${volume}:/var/lib/postgresql" \
  --volume "${resolved_dump}:/backup.dump:ro" \
  --volume "${project_dir}/supabase/migrations:/migrations:ro" \
  --volume "${project_dir}/scripts/apply_migrations_vps.sh:/apply-migrations.sh:ro" \
  "${restore_image}" >/dev/null

ready=0
for _attempt in $(seq 1 60); do
  if docker exec "${container}" sh -ec \
    'test "$(cat /proc/1/comm)" = postgres; pg_isready -U fitness_restore -d fitness_restore' \
    >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "${ready}" -ne 1 ]]; then
  echo "Temporary restore database did not become ready." >&2
  exit 1
fi

docker exec "${container}" pg_restore --list /backup.dump >/dev/null
dump_table_count="$(
  docker exec "${container}" pg_restore --list /backup.dump \
    | awk '$4 == "TABLE" && $5 == "public" { count += 1 } END { print count + 0 }'
)"

started_at="$(date +%s)"
docker exec "${container}" pg_restore \
  -U fitness_restore \
  -d fitness_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  /backup.dump >/dev/null
restore_seconds="$(( $(date +%s) - started_at ))"

restored_table_count="$(
  docker exec "${container}" psql -U fitness_restore -d fitness_restore -At \
    -c "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
)"
if [[ "${dump_table_count}" -ne "${restored_table_count}" ]]; then
  echo "Table mismatch: dump=${dump_table_count}, restored=${restored_table_count}." >&2
  exit 1
fi

for _pass in 1 2; do
  docker exec \
    --env PGHOST=/var/run/postgresql \
    --env PGUSER=fitness_restore \
    --env PGPASSWORD="${restore_password}" \
    --env PGDATABASE=fitness_restore \
    --env MIGRATIONS_DIR=/migrations \
    "${container}" sh /apply-migrations.sh >/dev/null
done

count_commands="$(
  docker exec "${container}" psql -U fitness_restore -d fitness_restore -At -c \
    "SELECT format('SELECT %L || chr(9) || count(*) FROM %I.%I;', schemaname || '.' || tablename, schemaname, tablename) FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
)"
printf '%s\n' "${count_commands}" \
  | docker exec -i "${container}" psql -U fitness_restore -d fitness_restore -At \
  | sort > "${counts_file}"

total_rows="$(awk -F '\t' '{ total += $2 } END { print total + 0 }' "${counts_file}")"
counts_fingerprint="$(sha256sum "${counts_file}" | cut -d ' ' -f 1)"
critical_counts="$(
  docker exec "${container}" psql -U fitness_restore -d fitness_restore -At -c \
    "SELECT json_build_object('users', (SELECT count(*) FROM users), 'workouts', (SELECT count(*) FROM workouts), 'exercises', (SELECT count(*) FROM exercises), 'programs', (SELECT count(*) FROM programs), 'audit_events', (SELECT count(*) FROM admin_audit_log));"
)"
archive_counts="$(
  docker exec "${container}" psql -U fitness_restore -d fitness_restore -At -c \
    "SELECT json_build_object('deleted_users', (SELECT count(*) FROM users WHERE is_deleted), 'deleted_exercises', (SELECT count(*) FROM exercises WHERE is_deleted), 'archived_programs', (SELECT count(*) FROM programs WHERE publication_status = 'archived'));"
)"

audit_rows="$(
  docker exec "${container}" psql -U fitness_restore -d fitness_restore -At -c \
    "SELECT count(*) FROM admin_audit_log;"
)"
if [[ "${audit_rows}" -gt 0 ]]; then
  if docker exec "${container}" psql -v ON_ERROR_STOP=1 -U fitness_restore -d fitness_restore \
    -c "UPDATE admin_audit_log SET action = action WHERE id = (SELECT id FROM admin_audit_log LIMIT 1);" \
    >/dev/null 2>"${audit_error}"; then
    echo "Append-only audit trigger allowed an update." >&2
    exit 1
  fi
  if ! grep -q "admin_audit_log is append-only" "${audit_error}"; then
    echo "Audit update failed for an unexpected reason." >&2
    exit 1
  fi
  audit_trigger="verified"
else
  audit_trigger="not_applicable_empty_log"
fi

echo "RESTORE_VERIFY_OK"
echo "backup_sha256=$(sha256sum "${resolved_dump}" | cut -d ' ' -f 1)"
echo "restore_seconds=${restore_seconds}"
echo "public_tables=${restored_table_count}"
echo "total_public_rows=${total_rows}"
echo "table_count_fingerprint=${counts_fingerprint}"
echo "critical_counts=${critical_counts}"
echo "archive_counts=${archive_counts}"
echo "audit_trigger=${audit_trigger}"
