# -*- coding: utf-8 -*-
"""DEPRECATED — do not use.

Catalog GIFs now come from hasaneyldrm/exercises-dataset (Gym visual IDs),
via `rebuild_catalog_from_dataset.py`. Semantic English filenames are archived.
"""
raise SystemExit(
    "DEPRECATED: use scripts/rebuild_catalog_from_dataset.py "
    "(Gym visual GIFs from exercises-dataset)."
)

# --- legacy below (unreachable) ---
"""Re-apply semantic GIF filenames from exercise-gifs-manifest.json to DB + seed.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise

MANIFEST = REPO / "frontend" / "public" / "exercise-gifs" / "exercise-gifs-manifest.json"
GIFS_DIR = REPO / "frontend" / "public" / "exercise-gifs"
SEED = ROOT / "scripts" / "seed_content" / "exercises.json"


def resolve_file(fname: str) -> str | None:
    """Return existing filename (gif or webp sibling)."""
    p = GIFS_DIR / fname
    if p.is_file():
        return fname
    stem = Path(fname).stem
    for ext in (".gif", ".webp", ".png", ".jpg", ".jpeg"):
        alt = GIFS_DIR / f"{stem}{ext}"
        if alt.is_file():
            return alt.name
    return None


def norm(s: str) -> str:
    return " ".join(s.strip().lower().replace("ё", "е").split())


async def main() -> None:
    items = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_id = {str(it["id"]): it for it in items}
    by_name = {norm(it["name_ru"]): it for it in items}

    async with AsyncSessionLocal() as session:
        rows = list(
            await session.scalars(select(Exercise).where(Exercise.is_deleted.is_(False)))
        )
        updated = 0
        missing = []
        for ex in rows:
            it = by_id.get(str(ex.id)) or by_name.get(norm(ex.name_ru))
            if not it:
                missing.append(ex.name_ru)
                continue
            resolved = resolve_file(it["file"])
            if not resolved:
                missing.append(f"{ex.name_ru} (file {it['file']})")
                continue
            rel = f"/exercise-gifs/{resolved}"
            if ex.animation_url != rel:
                print(f"FIX {ex.name_ru}: {ex.animation_url} -> {rel}")
                ex.animation_url = rel
                updated += 1
        await session.commit()
        print(f"DB updated={updated} catalog={len(rows)} issues={len(missing)}")
        for m in missing:
            print("  issue:", m)

    # Keep seed in sync by name_ru
    if SEED.is_file():
        seed = json.loads(SEED.read_text(encoding="utf-8"))
        seed_upd = 0
        for row in seed:
            name = row.get("name_ru") or ""
            it = by_name.get(norm(name))
            if not it:
                continue
            resolved = resolve_file(it["file"])
            if not resolved:
                continue
            rel = f"/exercise-gifs/{resolved}"
            if row.get("animation_url") != rel:
                row["animation_url"] = rel
                seed_upd += 1
        SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"seed updated={seed_upd}")


if __name__ == "__main__":
    asyncio.run(main())
