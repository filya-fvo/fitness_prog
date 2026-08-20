"""Apply supabase/migrations/20260726000010_email_auth.sql to local DB."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text

from app.core.database import engine

SQL_PATH = ROOT.parent / "supabase" / "migrations" / "20260726000010_email_auth.sql"


def _split_sql(sql: str) -> list[str]:
    lines: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        lines.append(line)
    blob = "\n".join(lines)
    parts = [p.strip() for p in blob.split(";")]
    return [p for p in parts if p]


async def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    statements = _split_sql(sql)
    async with engine.begin() as conn:
        for stmt in statements:
            await conn.execute(text(stmt))
        cols = (
            await conn.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'users' AND column_name IN ('auth_email', 'telegram_id')
                    ORDER BY column_name
                    """
                )
            )
        ).fetchall()
        tables = (
            await conn.execute(
                text(
                    """
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'email_otp_codes'
                    """
                )
            )
        ).fetchall()
    print("statements", len(statements))
    print("columns", [r[0] for r in cols])
    print("tables", [r[0] for r in tables])
    print("OK")


if __name__ == "__main__":
    asyncio.run(main())
