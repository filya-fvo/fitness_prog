"""Keep the independent, owner-approved illustrations during seed regeneration."""

from __future__ import annotations

import json
from pathlib import Path

MANIFEST = Path(__file__).resolve().parents[2] / "frontend/public/exercise-images/manifest.json"


def apply_approved_images(rows: list[dict]) -> None:
    if not MANIFEST.exists():
        return
    images = json.loads(MANIFEST.read_text(encoding="utf-8"))["images"]
    by_name = {item["name_ru"]: item for item in images}
    for row in rows:
        item = by_name.get(row["name_ru"])
        if item is None:
            continue
        if f"ds:{item['mapping_id']}" not in row.get("tags", []):
            raise ValueError(f"Image identity differs for {row['name_ru']}")
        row["image_url"] = item["image_url"]
        row["thumbnail_url"] = item["thumbnail_url"]
        row["tags"] = list(dict.fromkeys([
            *row.get("tags", []), "image:owner-approved:2026-10-01",
        ]))
