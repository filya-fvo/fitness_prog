# -*- coding: utf-8 -*-
"""Apply local /exercise-gifs/<file>.gif paths to exercises.animation_url.

Reads frontend/public/exercise-gifs/exercise-gifs-manifest.json
(or regenerates via gen_exercise_gif_list.py).

Only sets animation_url when the GIF file exists on disk (unless --force-paths).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise

REPO = ROOT.parent
MANIFEST = REPO / "frontend" / "public" / "exercise-gifs" / "exercise-gifs-manifest.json"
GIFS_DIR = REPO / "frontend" / "public" / "exercise-gifs"


async def main(force_paths: bool = False) -> None:
    if not MANIFEST.exists():
        raise SystemExit(
            f"Missing {MANIFEST}. Run: python scripts/gen_exercise_gif_list.py"
        )
    items = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_id = {it["id"]: it for it in items}

    async with AsyncSessionLocal() as session:
        rows = list(
            await session.scalars(select(Exercise).where(Exercise.is_deleted.is_(False)))
        )
        updated = 0
        skipped_missing_file = 0
        for ex in rows:
            it = by_id.get(str(ex.id))
            if not it:
                continue
            fname = it["file"]
            fpath = GIFS_DIR / fname
            if not force_paths and not fpath.is_file():
                skipped_missing_file += 1
                continue
            rel = it["animation_url"]  # /exercise-gifs/foo.gif
            if ex.animation_url != rel:
                ex.animation_url = rel
                # media_source is only for video: youtube|external|none
                # GIF lives in animation_url and must not set media_source=animation
                src = (ex.media_source or "none").strip()
                if src not in {"youtube", "external", "none"}:
                    if ex.video_url and "youtu" in (ex.video_url or ""):
                        ex.media_source = "youtube"
                    elif ex.video_url:
                        ex.media_source = "external"
                    else:
                        ex.media_source = "none"
                updated += 1
        await session.commit()
        print(
            f"apply_local_exercise_gifs: updated={updated} "
            f"missing_files={skipped_missing_file} catalog={len(items)}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--force-paths",
        action="store_true",
        help="Write animation_url even if GIF file is not on disk yet",
    )
    args = parser.parse_args()
    asyncio.run(main(force_paths=args.force_paths))
