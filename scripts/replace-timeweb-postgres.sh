#!/usr/bin/env bash
set -euo pipefail

project_dir="${1:-/opt/fitness/source}"
dump_path="${2:-/opt/fitness/backups/final-import.dump}"
expected_sha256="${3:-}"
env_file="${project_dir}/backend/.env.production"
backup_dir="/opt/fitness/backups"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [[ ! "${expected_sha256}" =~ ^[A-Fa-f0-9]{64}$ ]]; then
  echo "A 64-character expected SHA256 is required." >&2
  exit 1
fi

if [[ ! -r "${dump_path}" || ! -r "${env_file}" ]]; then
  echo "Dump or production environment file is missing." >&2
  exit 1
fi

actual_sha256="$(sha256sum "${dump_path}" | cut -d ' ' -f 1)"
if [[ "${actual_sha256,,}" != "${expected_sha256,,}" ]]; then
  echo "Dump SHA256 mismatch; refusing to replace the database." >&2
  exit 1
fi

cd "${project_dir}"
compose=(docker compose --env-file "${env_file}")

BACKUP_DIR="${backup_dir}" sh scripts/backup_vps.sh
"${compose[@]}" stop worker api web caddy
"${compose[@]}" up -d db redis

"${compose[@]}" exec -T db psql -U fitness -d postgres -v ON_ERROR_STOP=1 \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'fitness' AND pid <> pg_backend_pid();"
"${compose[@]}" exec -T db dropdb -U fitness --if-exists fitness
"${compose[@]}" exec -T db createdb -U fitness -O fitness -T template0 fitness

bash scripts/restore-timeweb-postgres.sh "${project_dir}" "${dump_path}"
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d api web caddy

"${compose[@]}" exec -T api curl -fsS http://127.0.0.1:8000/health
echo
"${compose[@]}" exec -T web wget -qO- http://127.0.0.1/ >/dev/null
echo "FINAL_DATABASE_RESTORE_OK sha256=${actual_sha256}"
