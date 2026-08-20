"""Deterministic audit of the exercise catalog, manifest and local GIF files."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
SEED = REPO / "backend" / "scripts" / "seed_content" / "exercises.json"
DATASET = REPO / "backups" / "exercises-dataset-src" / "data" / "exercises.json"
GIFS = REPO / "frontend" / "public" / "exercise-gifs"
MANIFEST = GIFS / "exercise-gifs-manifest.json"
DEFAULT_REPORT = REPO / "docs" / "EXERCISE_MEDIA_AUDIT_2026-08-20.md"

# These catalog entries intentionally share one accurate source animation.
ACCEPTABLE_SHARED_MEDIA = {
    "0375-9XjtHvS.gif": {
        "Пуловер с гантелью",
        "Пуловер с гантелью лёжа поперёк скамьи",
    },
    "0334-DsgkuIt.gif": {
        "Разводка гантелей в стороны",
        "Махи гантелями в стороны",
    },
    "3305-f7Y9eDZ.gif": {
        "Присед с жимом над головой",
        "Комплекс присед + жим",
    },
}


def load_json(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def audit() -> tuple[list[dict[str, str]], list[str]]:
    seed = load_json(SEED)
    dataset = {str(row["id"]): row for row in load_json(DATASET)}
    manifest_rows = load_json(MANIFEST)
    manifest = {str(row["name_ru"]): row for row in manifest_rows}
    errors: list[str] = []
    rows: list[dict[str, str]] = []

    seed_names = [str(row["name_ru"]) for row in seed]
    manifest_names = [str(row["name_ru"]) for row in manifest_rows]
    if len(seed_names) != len(set(seed_names)):
        errors.append("В seed есть повторяющиеся названия упражнений.")
    if len(manifest_names) != len(set(manifest_names)):
        errors.append("В manifest есть повторяющиеся названия упражнений.")
    if set(seed_names) != set(manifest_names):
        errors.append("Состав manifest не совпадает с активным seed-каталогом.")

    media_uses = Counter(Path(str(row.get("animation_url") or "")).name for row in seed)
    media_uses.pop("", None)
    users_by_file: dict[str, set[str]] = {}
    for row in seed:
        filename = Path(str(row.get("animation_url") or "")).name
        if filename:
            users_by_file.setdefault(filename, set()).add(str(row["name_ru"]))

    for filename, users in users_by_file.items():
        if len(users) > 1 and ACCEPTABLE_SHARED_MEDIA.get(filename) != users:
            errors.append(f"Непроверенное совместное медиа {filename}: {', '.join(sorted(users))}")

    for row in seed:
        name = str(row["name_ru"])
        tags = {str(tag) for tag in row.get("tags") or []}
        source_ids = sorted(tag[3:] for tag in tags if tag.startswith("ds:"))
        source_id = source_ids[0] if len(source_ids) == 1 else ""
        source = dataset.get(source_id)
        animation = str(row.get("animation_url") or "")
        filename = Path(animation).name
        manifest_row = manifest.get(name)

        if len(source_ids) != 1 or source is None:
            errors.append(f"{name}: отсутствует единственный корректный ds:<id>.")
        if manifest_row is None:
            errors.append(f"{name}: отсутствует в manifest.")

        if animation:
            status = "допустимый вариант" if media_uses[filename] > 1 else "точное"
            if "media:no-exact-gif" in tags:
                errors.append(f"{name}: GIF назначен, но оставлен тег media:no-exact-gif.")
            if not animation.startswith("/exercise-gifs/"):
                errors.append(f"{name}: некорректный локальный URL {animation}.")
            if source and Path(str(source.get("gif_url") or "")).name != filename:
                errors.append(f"{name}: файл не соответствует source ds:{source_id}.")
            if manifest_row and (
                str(manifest_row.get("file") or "") != filename
                or str(manifest_row.get("animation_url") or "") != animation
            ):
                errors.append(f"{name}: seed и manifest расходятся.")
            file_path = GIFS / filename
            if not file_path.is_file() or file_path.stat().st_size < 500:
                errors.append(f"{name}: файл отсутствует или пуст: {filename}.")
            elif file_path.read_bytes()[:6] not in {b"GIF87a", b"GIF89a"}:
                errors.append(f"{name}: файл не является GIF: {filename}.")
        else:
            status = "отклонено: нет точного GIF" if "media:no-exact-gif" in tags else "отсутствует"
            if "media:no-exact-gif" not in tags:
                errors.append(f"{name}: медиа отсутствует без причины.")
            if manifest_row and (
                str(manifest_row.get("file") or "")
                or str(manifest_row.get("animation_url") or "")
            ):
                errors.append(f"{name}: manifest назначает медиа, отсутствующее в seed.")

        rows.append(
            {
                "name": name,
                "status": status,
                "source": f"ds:{source_id}" if source_id else "—",
                "source_name": str(source.get("name") or "—") if source else "—",
                "file": filename or "—",
            }
        )

    return rows, errors


def write_report(path: Path, rows: list[dict[str, str]], errors: list[str]) -> None:
    counts = Counter(row["status"] for row in rows)
    lines = [
        "# Аудит медиа упражнений — 20 августа 2026",
        "",
        "Проверены seed-каталог, manifest, ссылки на исходный датасет, наличие файлов и GIF-сигнатуры.",
        "Совместное использование одного файла разрешено только для явно перечисленных синонимов/вариантов.",
        "",
        f"- Проверено: **{len(rows)} из {len(rows)} упражнений (100%)**.",
        f"- Точное медиа: **{counts['точное']}**.",
        f"- Допустимые варианты: **{counts['допустимый вариант']}**.",
        f"- Осознанно отклонено из-за отсутствия точного GIF: **{counts['отклонено: нет точного GIF']}**.",
        f"- Ошибки: **{len(errors)}**.",
        "- «Планка»: файл `2135-VBAWRPG.gif` визуально проверен — обычная планка на предплечьях; включён в каталог.",
        "- «Боковая планка»: кандидат `3544-5VXmnV5.gif` визуально отклонён как другое упражнение.",
        "",
    ]
    if errors:
        lines.extend(["## Ошибки", "", *[f"- {error}" for error in errors], ""])
    lines.extend(
        [
            "## Полный перечень",
            "",
            "| Упражнение | Статус | Источник | Название в источнике | Файл |",
            "|---|---|---|---|---|",
        ]
    )
    for row in rows:
        values = [row["name"], row["status"], row["source"], row["source_name"], row["file"]]
        lines.append("| " + " | ".join(value.replace("|", "\\|") for value in values) + " |")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()
    rows, errors = audit()
    if args.report:
        write_report(args.report, rows, errors)
    counts = Counter(row["status"] for row in rows)
    print(
        f"checked={len(rows)} exact={counts['точное']} variants={counts['допустимый вариант']} "
        f"rejected={counts['отклонено: нет точного GIF']} errors={len(errors)}"
    )
    for error in errors:
        print(f"ERROR: {error}")
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
