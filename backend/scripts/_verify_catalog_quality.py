# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from sqlalchemy import text

from app.core.database import engine

G = Path(r"C:/fitness_prog/frontend/public/exercise-gifs")
REPORT = Path(r"C:/fitness_prog/backups/catalog_rebuild_report.json")


async def main() -> None:
    async with engine.connect() as c:
        n = (
            await c.execute(text("select count(*) from exercises where is_deleted=false"))
        ).scalar()
        p = (
            await c.execute(text("select count(*) from programs where is_deleted=false"))
        ).scalar()
        print("db_exercises", n, "db_programs", p)

        rows = (
            await c.execute(
                text(
                    """
                    select name_ru, animation_url from exercises
                    where is_deleted=false
                      and name_ru = any(:names)
                    order by name_ru
                    """
                ),
                {
                    "names": [
                        "Кошка-корова",
                        "Ягодичный мост со штангой",
                        "Тяга штанги в наклоне",
                        "Жим штанги лёжа",
                        "Птица-собака",
                        "Удержание «лодочки»",
                        "Жим ногами",
                    ]
                },
            )
        ).fetchall()
        for name, au in rows:
            f = G / Path(au or "").name if au else None
            ok = bool(f and f.is_file())
            size = f.stat().st_size if ok else 0
            print(f"SAMPLE {name} -> {au} file={ok} size={size}")

        bad = (
            await c.execute(
                text(
                    """
                    select count(*) from exercises
                    where is_deleted=false
                      and (animation_url is null or animation_url = '')
                    """
                )
            )
        ).scalar()
        print("no_gif", bad)

        names = {
            r[0]
            for r in (
                await c.execute(
                    text("select name_ru from exercises where is_deleted=false")
                )
            ).fetchall()
        }
        progs = (
            await c.execute(
                text("select name, structure from programs where is_deleted=false")
            )
        ).fetchall()
        missing: set[str] = set()
        empty_days = 0
        for pname, st in progs:
            days = (st or {}).get("schedule") or []
            if not days:
                empty_days += 1
            for day in days:
                for e in day.get("exercises") or []:
                    en = e.get("exercise_name")
                    if en not in names:
                        missing.add(f"{pname}:{en}")
        print("prog_missing", sorted(missing)[:20], "count", len(missing))
        print("empty_program_days_programs", empty_days)

        # every animation file exists
        miss_files = []
        for name, au in (
            await c.execute(
                text(
                    "select name_ru, animation_url from exercises where is_deleted=false"
                )
            )
        ).fetchall():
            if not au:
                miss_files.append(name)
                continue
            fp = G / Path(au).name
            if not fp.is_file() or fp.stat().st_size < 500:
                miss_files.append(name)
        print("missing_or_tiny_files", len(miss_files), miss_files[:10])

    gifs = list(G.glob("*.gif"))
    print("gif_files_on_disk", len(gifs))
    if REPORT.is_file():
        rep = json.loads(REPORT.read_text(encoding="utf-8"))
        print("report_errors", rep.get("errors"))
        print("report_seed", rep.get("seed_count"), "programs", rep.get("program_count"))


if __name__ == "__main__":
    asyncio.run(main())
