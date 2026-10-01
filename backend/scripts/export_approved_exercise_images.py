"""Export owner-approved local illustrations and exact first-phase thumbnails.

Run from the repository root with a Python environment containing Pillow.
Original PNGs and owner review files are never modified.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

REPO = Path(__file__).resolve().parents[2]
PUBLIC = REPO / "frontend" / "public"
SEED = REPO / "backend" / "scripts" / "seed_content" / "exercises.json"
ROUNDS = [
    "exercise-catalog-review-2026-09-30",
    "exercise-corrections-review-2026-10-01",
    "exercise-corrections-review-2026-10-01-round2",
    "exercise-corrections-review-2026-10-01-round3",
    "exercise-corrections-review-2026-10-01-round4",
]
# These exceptions were explicitly chosen in the owner review rounds.
SINGLE_PHASE = {61, 62, 78, 79}
THREE_PHASE = {68, 72, 77, 81, 82}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_selected() -> dict[int, tuple[Path, dict]]:
    selected: dict[int, tuple[Path, dict]] = {}
    for folder in ROUNDS:
        root = REPO / "artifacts" / folder
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        selected.update({item["number"]: (root, item) for item in manifest["images"]})
    if set(selected) != set(range(1, 135)):
        raise ValueError("Expected exactly the reviewed catalogue numbers 1–134")
    return selected


def initial_crop(image: Image.Image, phases: int) -> tuple[int, int, int, int]:
    width, height = image.size
    if phases == 1:
        return (0, 0, width, height)
    boundary = width // phases
    pixels = image.load()
    # Generated dividers can be a few pixels off the equal-panel boundary.
    for x in range(boundary - width // 40, boundary + width // 40):
        bright = sum(min(pixels[x, y]) > 170 for y in range(height))
        if bright > height * 0.75:
            return (0, 0, x, height)
    return (0, 0, boundary - 3, height)


def main() -> None:
    selected = load_selected()
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    by_name = {row["name_ru"]: row for row in seed}
    if len(seed) != 134:
        raise ValueError("Reviewed package does not match the active catalogue size")
    for folder in ("exercise-images", "exercise-thumbnails"):
        (PUBLIC / folder).mkdir(parents=True, exist_ok=True)
    items = []
    for number, (review_root, item) in sorted(selected.items()):
        name = item["catalog_name"]
        if name == "Скручивания на верхнем блоке":
            name = "Молитва"
        row = by_name[name]
        mapping_id = str(item["mapping_id"])
        if f"ds:{mapping_id}" not in row["tags"]:
            raise ValueError(f"Catalogue identity differs for {name}")
        source = (review_root / item["file"]).resolve()
        source_sha = digest(source)
        expected_sha = item.get("metadata", {}).get("sha256")
        if expected_sha and source_sha != expected_sha:
            raise ValueError(f"Reviewed source changed: {source}")
        phases = 1 if number in SINGLE_PHASE else 3 if number in THREE_PHASE else 2
        full_name = f"{number:03d}-{mapping_id}-{source_sha[:12]}.webp"
        thumb_name = full_name.removesuffix(".webp") + "-start.webp"
        full = PUBLIC / "exercise-images" / full_name
        thumb = PUBLIC / "exercise-thumbnails" / thumb_name
        with Image.open(source) as original:
            image = original.convert("RGB")
            width, height = image.size
            if not full.exists():
                image.save(full, "WEBP", quality=94, method=6)
            # Entire initial panel, with the divider excluded. No pose synthesis.
            crop = initial_crop(image, phases)
            initial = image.crop(crop)
            initial.thumbnail((512, 512), Image.Resampling.LANCZOS)
            initial.save(thumb, "WEBP", quality=92, method=6)
        row["image_url"] = f"/exercise-images/{full_name}"
        row["thumbnail_url"] = f"/exercise-thumbnails/{thumb_name}"
        approval_tag = "image:owner-approved:2026-10-01"
        row["tags"] = list(dict.fromkeys([*row["tags"], approval_tag]))
        items.append({
            "number": number,
            "name_ru": name,
            "mapping_id": mapping_id,
            "image_url": row["image_url"],
            "thumbnail_url": row["thumbnail_url"],
            "phase_count": phases,
            "thumbnail_phase": "initial",
            "crop_box": list(crop),
            "source_file": source.relative_to(REPO).as_posix(),
            "source_sha256": source_sha,
            "source_size": [width, height],
            "image_sha256": digest(full),
            "thumbnail_sha256": digest(thumb),
            "image_bytes": full.stat().st_size,
            "thumbnail_bytes": thumb.stat().st_size,
            "status": "owner-approved",
            "approval_evidence": "отлично." if number == 68 else "отлично, все принял.",
            "provenance": "AI-generated illustration; owner-reviewed, not Gym visual media",
        })
        print(f"exported={number:03d} phases={phases} bytes={full.stat().st_size}", flush=True)
    manifest = {"date": "2026-10-01", "count": len(items), "images": items}
    (PUBLIC / "exercise-images" / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Contact sheets allow visual inspection of every cropped initial phase.
    qa = REPO / "artifacts" / "exercise-images-release-2026-10-01"
    qa.mkdir(parents=True, exist_ok=True)
    for page in range(4):
        subset = items[page * 36:(page + 1) * 36]
        if not subset:
            continue
        sheet = Image.new("RGB", (1200, 6 * 190), "#101820")
        draw = ImageDraw.Draw(sheet)
        for position, item in enumerate(subset):
            x, y = position % 6 * 200, position // 6 * 190
            with Image.open(PUBLIC / item["thumbnail_url"].lstrip("/")) as image:
                tile = ImageOps.contain(image, (194, 158))
                sheet.paste(tile, (x + (200 - tile.width) // 2, y))
            draw.text((x + 8, y + 160), f"{item['number']:03d} / {item['phase_count']} phases", fill="white")
        sheet.save(qa / f"initial-phases-{page + 1}.jpg", quality=93)
    print(f"approved={len(items)} total_bytes={sum(x['image_bytes'] + x['thumbnail_bytes'] for x in items)}")


if __name__ == "__main__":
    main()
