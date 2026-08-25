#!/bin/sh
set -eu

echo "[timeweb] validating production environment"
python /app/scripts/validate_timeweb_env.py

echo "[timeweb] applying database migrations"
python /app/scripts/apply_migrations_timeweb.py

echo "[timeweb] synchronizing versioned catalogues"
python /app/scripts/seed_prod_content.py
python /app/scripts/seed_nutrition.py

echo "[timeweb] starting API and notification worker"
exec python /app/run_api_and_worker.py
