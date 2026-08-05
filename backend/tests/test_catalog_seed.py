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
    bad: list[str] = []
    for p in programs:
        assert p.get("is_template") is True
        schedule = (p.get("structure") or {}).get("schedule") or []
        assert schedule, p.get("name")
        for day in schedule:
            assert day.get("exercises"), p.get("name")
            for e in day["exercises"]:
                name = e.get("exercise_name")
                if name not in exercises:
                    bad.append(f"{p.get('name')}:{name}")
    assert not bad, bad[:20]


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
    }
    assert required <= names
