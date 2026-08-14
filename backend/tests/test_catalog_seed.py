# -*- coding: utf-8 -*-
"""Seed catalog consistency (no DB required)."""
from __future__ import annotations

import json
from pathlib import Path

SEED = Path(__file__).resolve().parents[1] / "scripts" / "seed_content"
GIFS = Path(__file__).resolve().parents[2] / "frontend" / "public" / "exercise-gifs"


def test_exercises_seed_has_gifs_and_unique_names() -> None:
    rows = json.loads((SEED / "exercises.json").read_text(encoding="utf-8"))
    assert len(rows) >= 80
    names = [r["name_ru"] for r in rows]
    assert len(names) == len(set(names))
    missing = []
    for r in rows:
        au = r.get("animation_url") or ""
        assert au.startswith("/exercise-gifs/"), r["name_ru"]
        fp = GIFS / Path(au).name
        if not fp.is_file() or fp.stat().st_size < 500:
            missing.append(r["name_ru"])
    assert not missing, f"missing gif files: {missing[:10]}"


def test_programs_only_reference_known_exercises() -> None:
    exercises = {
        r["name_ru"]
        for r in json.loads((SEED / "exercises.json").read_text(encoding="utf-8"))
    }
    programs = json.loads((SEED / "programs.json").read_text(encoding="utf-8"))
    assert len(programs) >= 25
    canonical_equipment = {"bodyweight", "bands", "dumbbells", "barbell", "machines"}
    bad: list[str] = []
    for p in programs:
        assert p.get("is_template") is True
        structure = p.get("structure") or {}
        schedule = structure.get("schedule") or []
        assert schedule, p.get("name")
        assert len(schedule) == structure.get("days_per_week"), p.get("name")
        assert set(structure.get("equipment") or []) <= canonical_equipment, p.get("name")
        for day in schedule:
            assert day.get("exercises"), p.get("name")
            assert len(day["exercises"]) in {6, 7}, f"{p.get('name')}:{day.get('name')}"
            day_names = [e.get("exercise_name") for e in day["exercises"]]
            assert len(day_names) == len(set(day_names)), f"{p.get('name')}:{day.get('name')}"
            for e in day["exercises"]:
                name = e.get("exercise_name")
                if name not in exercises:
                    bad.append(f"{p.get('name')}:{name}")
    assert not bad, bad[:20]


def test_shoulder_sensitive_program_matrix_and_exercises() -> None:
    programs = json.loads((SEED / "programs.json").read_text(encoding="utf-8"))
    shoulder_programs = [
        p for p in programs
        if "shoulder_sensitive" in (p.get("structure") or {}).get("limitations", [])
    ]
    assert len(shoulder_programs) == 10
    expected = {
        (sex, location, level)
        for sex in ("male", "female")
        for location, levels in (
            ("home", ("beginner", "intermediate")),
            ("gym", ("beginner", "intermediate", "advanced")),
        )
        for level in levels
    }
    actual = {
        (p["structure"]["sex"][0], p["structure"]["location"], p["structure"]["level"])
        for p in shoulder_programs
    }
    assert actual == expected

    unsafe = (
        "жим штанги", "жим гантелей", "жим в тренажёре", "жим вверх", "жим арнольда",
        "отжим", "брусь", "подтягив", "верхнего блока", "горизонтального блока",
        "тяга штанги", "тяга гантели", "пуловер", "развод", "развед", "махи",
        "планка", "птица-собака", "фермер", "из-за головы", "француз",
    )
    for program in shoulder_programs:
        for day in program["structure"]["schedule"]:
            for item in day["exercises"]:
                name = item["exercise_name"].lower()
                assert not any(token in name for token in unsafe), item["exercise_name"]


def test_key_compound_lifts_present() -> None:
    names = {
        r["name_ru"]
        for r in json.loads((SEED / "exercises.json").read_text(encoding="utf-8"))
    }
    required = {
        "Жим штанги лёжа",
        "Приседания со штангой",
        "Становая тяга классическая",
        "Тяга штанги в наклоне",
        "Подтягивания",
        "Кошка-корова",
        "Ягодичный мост со штангой",
        "Приседания в машине Смита",
        "Гакк-приседания",
        "Болгарские приседания в машине Смита",
        "Жим лёжа в машине Смита",
        "Жим на наклонной в тренажёре",
        "Сведение рук в тренажёре «бабочка»",
        "Жим вверх в тренажёре сидя",
        "Отведение руки в сторону на блоке",
        "Тяга с упором грудью в тренажёре",
        "Тяга верхнего блока нейтральным хватом",
        "Сгибания ног сидя",
        "Ягодичный мост в машине Смита",
        "Подъёмы на носки стоя в тренажёре",
        "Сгибания гантелей на бицепс на наклонной скамье",
        "Скручивания на верхнем блоке",
        "Жим Паллофа с резинкой",
    }
    assert required <= names
