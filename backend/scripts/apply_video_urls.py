"""Apply video_url (+ media_source) from seed JSON into DB without wiping GIFs.

Usage:
  cd backend
  .\\.venv\\Scripts\\python.exe scripts/apply_video_urls.py
  .\\.venv\\Scripts\\python.exe scripts/apply_video_urls.py --from-checklist
  .\\.venv\\Scripts\\python.exe scripts/apply_video_urls.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise

SEED = ROOT / "scripts" / "seed_content" / "exercises.json"
CHECKLIST = REPO / "docs" / "exercise-media-checklist.csv"


def media_source_for(url: str) -> str:
    u = (url or "").lower()
    if not u:
        return "none"
    if "youtu" in u:
        return "youtube"
    return "external"


def load_from_seed() -> dict[str, str]:
    rows = json.loads(SEED.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for row in rows:
        name = str(row.get("name_ru") or "").strip()
        url = str(row.get("video_url") or "").strip()
        if name and url:
            out[name] = url
    return out


def load_from_checklist() -> dict[str, str]:
    out: dict[str, str] = {}
    with CHECKLIST.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            name = str(row.get("name_ru") or "").strip()
            url = str(row.get("video_url") or "").strip()
            if name and url:
                out[name] = url
    return out


async def apply(urls: dict[str, str], *, dry_run: bool) -> None:
    updated = 0
    skipped_same = 0
    missing_in_db = 0
    async with AsyncSessionLocal() as session:
        exercises = list(
            (
                await session.scalars(
                    select(Exercise).where(Exercise.is_deleted.is_(False))
                )
            ).all()
        )
        by_name = {e.name_ru: e for e in exercises}
        by_id = {str(e.id): e for e in exercises}

        for key, url in urls.items():
            ex = by_name.get(key) or by_id.get(key)
            if ex is None:
                missing_in_db += 1
                continue
            cur = (ex.video_url or "").strip()
            if cur == url and (ex.media_source or "") == media_source_for(url):
                skipped_same += 1
                continue
            print(f"UPDATE {ex.name_ru}: {(cur or '-')[:50]} -> {url[:70]}")
            if not dry_run:
                ex.video_url = url
                ex.media_source = media_source_for(url)
            updated += 1

        if not dry_run:
            await session.commit()

    print(
        f"apply_video_urls: updated={updated} same={skipped_same} "
        f"missing_name={missing_in_db} dry_run={dry_run}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--from-checklist",
        action="store_true",
        help="Read docs/exercise-media-checklist.csv instead of seed exercises.json",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.from_checklist:
        if not CHECKLIST.is_file():
            raise SystemExit(f"Missing {CHECKLIST}")
        urls = load_from_checklist()
        print(f"source=checklist count={len(urls)}")
    else:
        if not SEED.is_file():
            raise SystemExit(f"Missing {SEED}")
        urls = load_from_seed()
        print(f"source=seed count={len(urls)}")

    asyncio.run(apply(urls, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
