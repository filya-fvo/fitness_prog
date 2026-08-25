"""Apply append-only SQL migrations in Timeweb without exposing DB credentials."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from sqlalchemy.engine import make_url


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
BOOTSTRAP = "20260823000021_restore_local_embedding_to_vector.sql"


def postgres_environment(database_url: str) -> dict[str, str]:
    """Convert the SQLAlchemy URL to libpq variables without logging a password."""
    url = make_url(database_url)
    if not url.drivername.startswith("postgresql"):
        raise ValueError("DATABASE_URL must use PostgreSQL")
    if not url.host or not url.database or not url.username:
        raise ValueError("DATABASE_URL must include host, database and username")

    env = dict(os.environ)
    env.update(
        {
            "PGHOST": url.host,
            "PGPORT": str(url.port or 5432),
            "PGDATABASE": url.database,
            "PGUSER": url.username,
            "PGCONNECT_TIMEOUT": "15",
        }
    )
    if url.password is not None:
        env["PGPASSWORD"] = url.password

    query = {str(key): str(value) for key, value in url.query.items()}
    ssl_mode = query.get("sslmode") or query.get("ssl")
    if ssl_mode:
        env["PGSSLMODE"] = "require" if ssl_mode.lower() in {"1", "true"} else ssl_mode
    return env


def ordered_migrations(directory: Path = MIGRATIONS) -> list[Path]:
    files = sorted(directory.glob("*.sql"))
    bootstrap = directory / BOOTSTRAP
    if bootstrap in files:
        return [bootstrap, *(file for file in files if file != bootstrap)]
    return files


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    files = ordered_migrations()
    if not files:
        raise SystemExit(f"No SQL migrations found in {MIGRATIONS}")

    env = postgres_environment(database_url)
    for migration in files:
        print(f"[migration] {migration.name}", flush=True)
        subprocess.run(
            ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-f", str(migration)],
            check=True,
            env=env,
        )
    print(f"[migration] complete count={len(files)}", flush=True)


if __name__ == "__main__":
    main()
