"""Validate full illustrations, source identity and initial-phase derivatives."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

PUBLIC = Path(__file__).resolve().parents[2] / "frontend/public"


def audit_images(seed: list[dict], public: Path = PUBLIC) -> list[str]:
    manifest_path = public / "exercise-images/manifest.json"
    if not manifest_path.is_file():
        return ["Manifest полных изображений отсутствует."]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    images = manifest["images"]
    errors: list[str] = []
    by_name = {item["name_ru"]: item for item in images}
    if len(by_name) != len(images) or set(by_name) != {row["name_ru"] for row in seed}:
        errors.append("Состав manifest изображений не совпадает с seed.")
    if manifest["count"] != len(images):
        errors.append("Неверное число изображений в manifest.")
    for row in seed:
        name = row["name_ru"]
        item = by_name.get(name)
        if item is None:
            continue
        if f"ds:{item['mapping_id']}" not in row["tags"]:
            errors.append(f"{name}: неверная привязка изображения к каталогу.")
        if item["status"] != "owner-approved" or not item["approval_evidence"]:
            errors.append(f"{name}: изображение не принято владельцем.")
        if item["thumbnail_phase"] != "initial" or item["phase_count"] not in {1, 2, 3}:
            errors.append(f"{name}: неверная фаза миниатюры.")
        source_width, source_height = item["source_size"]
        x0, y0, x1, y1 = item["crop_box"]
        if (x0, y0, y1) != (0, 0, source_height) or not 0 < x1 <= source_width / item["phase_count"] + 5:
            errors.append(f"{name}: обрезка захватывает больше исходной фазы.")
        for field, prefix, sha_field in (
            ("image_url", "/exercise-images/", "image_sha256"),
            ("thumbnail_url", "/exercise-thumbnails/", "thumbnail_sha256"),
        ):
            url = item[field]
            if row.get(field) != url or not url.startswith(prefix) or ".." in url:
                errors.append(f"{name}: seed/manifest расходятся для {field}.")
                continue
            path = public / url.lstrip("/")
            if not path.is_file():
                errors.append(f"{name}: отсутствует {url}.")
                continue
            if hashlib.sha256(path.read_bytes()).hexdigest() != item[sha_field]:
                errors.append(f"{name}: изменён принятый файл {url}.")
            with Image.open(path) as image:
                if image.format != "WEBP" or getattr(image, "n_frames", 1) != 1:
                    errors.append(f"{name}: неверный формат статичного изображения.")
                if field == "image_url" and list(image.size) != item["source_size"]:
                    errors.append(f"{name}: полное изображение обрезано.")
                if field == "thumbnail_url":
                    expected_ratio = x1 / source_height
                    if max(image.size) > 512 or abs(image.width / image.height - expected_ratio) > 0.02:
                        errors.append(f"{name}: неверный размер/пропорции миниатюры.")
    expected = {Path(item["image_url"]).name for item in images}
    actual = {path.name for path in (public / "exercise-images").glob("*.webp")}
    if actual != expected:
        errors.append("В папке полных изображений есть отсутствующие или лишние версии.")
    return errors
