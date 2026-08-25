#!/usr/bin/env bash
set -euo pipefail

project_dir="${1:-/opt/fitness/source}"
dump_path="${2:-/opt/fitness/backups/import.dump}"
env_file="${project_dir}/backend/.env.production"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [[ ! -r "${dump_path}" ]]; then
  echo "Dump is not readable: ${dump_path}" >&2
  exit 1
fi

if [[ ! -r "${env_file}" ]]; then
  echo "Environment file is not readable: ${env_file}" >&2
  exit 1
fi

cd "${project_dir}"
compose=(docker compose --env-file "${env_file}")

"${compose[@]}" exec -T db pg_isready -U fitness -d fitness
"${compose[@]}" exec -T db pg_restore --list < "${dump_path}" >/dev/null

table_count="$("${compose[@]}" exec -T db psql -U fitness -d fitness --tuples-only --no-align \
  --command="SELECT count(1) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")"
table_count="${table_count//[[:space:]]/}"

if [[ "${table_count}" != "0" ]]; then
  echo "Refusing to restore: public schema already contains ${table_count} tables." >&2
  exit 1
fi

echo "Dump SHA256: $(sha256sum "${dump_path}" | cut -d ' ' -f 1)"
"${compose[@]}" exec -T db pg_restore \
  -U fitness \
  -d fitness \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  < "${dump_path}"

restored_count="$("${compose[@]}" exec -T db psql -U fitness -d fitness --tuples-only --no-align \
  --command="SELECT count(1) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")"
restored_count="${restored_count//[[:space:]]/}"
echo "Restored public tables: ${restored_count}"
