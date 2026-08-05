# -*- coding: utf-8 -*-
"""Inspect public tables and user-data counts."""
from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.core.database import engine


async def main() -> None:
    async with engine.connect() as conn:
        tables = (
            await conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public' ORDER BY 1"
                )
            )
        ).fetchall()
        print("TABLES:")
        for (name,) in tables:
            print(" ", name)

        queries = [
            "SELECT count(*) FROM users",
            "SELECT count(*) FROM users WHERE telegram_id IS NOT NULL",
            "SELECT count(*) FROM workouts",
            "SELECT count(*) FROM workout_sets",
            "SELECT count(*) FROM nutrition_logs",
            "SELECT count(*) FROM ai_conversations",
            "SELECT count(*) FROM nutrition_products",
            "SELECT count(*) FROM nutrition_products WHERE source = 'manual'",
            "SELECT count(*) FROM exercises",
            "SELECT count(*) FROM programs",
        ]
        for q in queries:
            try:
                n = (await conn.execute(text(q))).scalar()
                print(f"{q} -> {n}")
            except Exception as exc:  # noqa: BLE001
                print(f"{q} ERR {exc}")

        # sample telegram ids (no PII beyond tg id)
        rows = (
            await conn.execute(
                text(
                    "SELECT telegram_id, username FROM users "
                    "WHERE telegram_id IS NOT NULL ORDER BY created_at NULLS LAST LIMIT 20"
                )
            )
        ).fetchall()
        print("SAMPLE_USERS:")
        for tid, uname in rows:
            print(f"  tg={tid} @{uname or '-'}")


if __name__ == "__main__":
    asyncio.run(main())
