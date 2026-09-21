"""Exercise metadata and deterministic program-structure reports."""

from __future__ import annotations

import json
from pathlib import Path

from app.services.exercise_classification import (
    build_program_structure_report,
    canonical_equipment,
    classify_exercise,
)


CONTENT = Path(__file__).resolve().parents[1] / "scripts" / "seed_content"


def test_equipment_and_movement_classification_are_specific() -> None:
    adduction = classify_exercise({
        "name_ru": "Сведение ног в тренажёре",
        "muscle_group": "ноги",
        "equipment": "тренажёр",
        "tags": [],
    })
    assert adduction.equipment == "machines"
    assert adduction.movement_pattern == "hip_adduction"
    assert adduction.primary_muscles == ("adductors",)
    assert adduction.exercise_role == "accessory"

    assert canonical_equipment("машина Смита") == "machines"
    assert canonical_equipment("свой вес") == "bodyweight"
    assert canonical_equipment("гантели") == "dumbbells"


def test_every_seed_exercise_has_compatible_structured_metadata() -> None:
    rows = json.loads((CONTENT / "exercises.json").read_text(encoding="utf-8"))
    for row in rows:
        tags = [str(tag) for tag in row.get("tags") or []]
        assert len([tag for tag in tags if tag.startswith("pattern:")]) == 1, row["name_ru"]
        assert len([tag for tag in tags if tag.startswith("role:")]) == 1, row["name_ru"]
        assert len([tag for tag in tags if tag.startswith("equipment:")]) == 1, row["name_ru"]
        assert any(tag.startswith("primary:") for tag in tags), row["name_ru"]


def test_seed_program_reports_have_matching_equipment() -> None:
    exercises = json.loads((CONTENT / "exercises.json").read_text(encoding="utf-8"))
    programs = json.loads((CONTENT / "programs.json").read_text(encoding="utf-8"))
    by_name = {row["name_ru"]: row for row in exercises}
    for program in programs:
        structure = program["structure"]
        report = build_program_structure_report(structure["schedule"], by_name)
        declared = set(structure.get("equipment") or [])
        required = set(report.required_equipment) - {"bodyweight"}
        assert required <= declared, program["name"]
        assert report.estimated_minutes > 0
        assert report.direct_sets
        assert report.pattern_sets


def test_seed_program_weekly_direct_volume_stays_within_review_limits() -> None:
    exercises = json.loads((CONTENT / "exercises.json").read_text(encoding="utf-8"))
    programs = json.loads((CONTENT / "programs.json").read_text(encoding="utf-8"))
    by_name = {row["name_ru"]: row for row in exercises}
    limits = {"beginner": 20, "intermediate": 26, "advanced": 32}

    for program in programs:
        structure = program["structure"]
        report = build_program_structure_report(structure["schedule"], by_name)
        limit = limits[structure["level"]]
        excessive = {
            muscle: sets
            for muscle, sets in report.direct_sets.items()
            if sets > limit
        }
        assert excessive == {}, program["name"]
