"""Enrich exercise text fields only (no external meme GIFs).

Does NOT set animation_url from Giphy/placeholders.
For local GIFs use:
  python scripts/gen_exercise_gif_list.py
  # drop files into frontend/public/exercise-gifs/
  python scripts/apply_local_exercise_gifs.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise


async def main() -> None:
    async with AsyncSessionLocal() as session:
        rows = list(
            await session.scalars(select(Exercise).where(Exercise.is_deleted.is_(False)))
        )
        updated = 0
        for ex in rows:
            changed = False
            au = (ex.animation_url or "").strip()
            if au.startswith("http") and any(x in au for x in ("giphy.com", "tenor.com")):
                ex.animation_url = None
                if (ex.media_source or "") == "giphy":
                    ex.media_source = (
                        "youtube"
                        if ex.video_url and "youtu" in (ex.video_url or "")
                        else ("external" if ex.video_url else "none")
                    )
                changed = True
            if not ex.media_source or ex.media_source not in {"youtube", "external", "none"}:
                if ex.video_url:
                    ex.media_source = (
                        "youtube" if "youtu" in (ex.video_url or "") else "external"
                    )
                    changed = True
                else:
                    # GIF is stored in animation_url; media_source stays none/external/youtube
                    ex.media_source = "none"
                    changed = True
            if not (ex.technique or "").strip():
                ex.technique = (
                    ex.description
                    or "Выполняйте движение подконтрольно, сохраняя нейтраль корпуса и полную амплитуду."
                )
                changed = True
            if not (ex.description or "").strip():
                ex.description = (
                    f"{ex.name_ru}: упражнение на группу «{ex.muscle_group or 'общая'}». "
                    f"Оборудование: {ex.equipment or 'не требуется'}."
                )
                changed = True
            if changed:
                updated += 1
        await session.commit()
        print(f"enrich_exercise_media: updated={updated} total={len(rows)}")


if __name__ == "__main__":
    asyncio.run(main())
