"""Build a deterministic equipment, duration and weekly-volume program report."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.exercise_classification import build_program_structure_report  # noqa: E402


CONTENT = ROOT / "scripts" / "seed_content"
DEFAULT_REPORT = REPO / "docs" / "PROGRAM_STRUCTURE_REPORT_2026-09-21.md"
REVIEW_SET_LIMITS = {"beginner": 20, "intermediate": 26, "advanced": 32}


def load_json(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def analyze() -> tuple[list[dict], list[str]]:
    exercises = load_json(CONTENT / "exercises.json")
    programs = load_json(CONTENT / "programs.json")
    by_name = {row["name_ru"]: row for row in exercises}
    rows: list[dict] = []
    errors: list[str] = []
    for program in programs:
        structure = program.get("structure") or {}
        schedule = structure.get("schedule") or []
        report = build_program_structure_report(schedule, by_name)
        declared = set(structure.get("equipment") or [])
        missing = sorted(set(report.required_equipment) - declared - {"bodyweight"})
        if missing:
            errors.append(f"{program['name']}: не заявлен инвентарь {', '.join(missing)}")
        day_minutes = [
            build_program_structure_report([workout_day], by_name).estimated_minutes
            for workout_day in schedule
        ]
        level = str(structure.get("level") or program.get("level") or "")
        review_limit = REVIEW_SET_LIMITS.get(level, 20)
        review_volume = {
            muscle: sets
            for muscle, sets in report.direct_sets.items()
            if sets > review_limit
        }
        rows.append({
            "name": program["name"],
            "level": level,
            "days": len(schedule),
            "day_minutes": day_minutes,
            "weekly_minutes": report.estimated_minutes,
            "direct_sets": report.direct_sets,
            "pattern_sets": report.pattern_sets,
            "required_equipment": report.required_equipment,
            "review_volume": review_volume,
        })
    return rows, errors


def write_report(path: Path, rows: list[dict], errors: list[str]) -> None:
    flagged = [row for row in rows if row["review_volume"]]
    lines = [
        "# Структурный отчёт тренировочных программ — 21 сентября 2026",
        "",
        "Отчёт построен из актуальных seed-каталогов. Время — расчётный диапазон на основе "
        "40 секунд работы и указанного отдыха на каждый подход; это ориентир для сравнения, "
        "а не фактическая длительность пользователя.",
        "",
        f"- Программ: **{len(rows)}**.",
        f"- Несовместимостей инвентаря: **{len(errors)}**.",
        f"- Программ для пересмотра недельного объёма: **{len(flagged)}**.",
        "",
    ]
    if errors:
        lines.extend(["## Ошибки инвентаря", "", *[f"- {error}" for error in errors], ""])
    lines.extend([
        "## Программы",
        "",
        "| Программа | Уровень | Дней | Минут на занятие | Минут в неделю | Объём для пересмотра |",
        "|---|---|---:|---:|---:|---|",
    ])
    for row in rows:
        minutes = row["day_minutes"]
        duration = f"{min(minutes)}–{max(minutes)}" if minutes else "—"
        volume = ", ".join(
            f"{muscle}: {sets}"
            for muscle, sets in row["review_volume"].items()
        ) or "—"
        lines.append(
            f"| {row['name']} | {row['level']} | {row['days']} | {duration} | "
            f"{row['weekly_minutes']} | {volume} |"
        )
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    rows, errors = analyze()
    write_report(args.report, rows, errors)
    print(f"programs={len(rows)} equipment_errors={len(errors)} report={args.report}")
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
