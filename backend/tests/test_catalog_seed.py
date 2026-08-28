# -*- coding: utf-8 -*-
"""Seed catalog consistency (no DB required)."""
from __future__ import annotations

import json
from pathlib import Path

SEED = Path(__file__).resolve().parents[1] / "scripts" / "seed_content"
GIFS = Path(__file__).resolve().parents[2] / "frontend" / "public" / "exercise-gifs"


def test_exercises_seed_has_traceable_media_and_unique_names() -> None:
    rows = json.loads((SEED / "exercises.json").read_text(encoding="utf-8"))
    assert len(rows) >= 80
    names = [r["name_ru"] for r in rows]
    assert len(names) == len(set(names))
    missing = []
    for r in rows:
        au = r.get("animation_url") or ""
        tags = {str(tag) for tag in (r.get("tags") or [])}
        if not au:
            assert "media:no-exact-gif" in tags, r["name_ru"]
            continue
        assert au.startswith("/exercise-gifs/"), r["name_ru"]
        source_ids = [tag[3:] for tag in tags if tag.startswith("ds:")]
        assert len(source_ids) == 1, f"untraceable gif: {r['name_ru']}"
        assert source_ids[0].isdigit(), f"invalid source id: {r['name_ru']}"
        assert Path(au).name.startswith(f"{source_ids[0]}-"), r["name_ru"]
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


def test_regular_programs_cover_the_full_sex_location_level_matrix() -> None:
    programs = json.loads((SEED / "programs.json").read_text(encoding="utf-8"))
    regular = [
        program
        for program in programs
        if not (program.get("structure") or {}).get("limitations")
    ]
    expected = {
        (sex, location, level)
        for sex in ("male", "female")
        for location in ("gym", "home", "outdoor")
        for level in ("beginner", "intermediate", "advanced")
    }
    actual = {
        (
            program["structure"]["sex"][0],
            program["structure"]["location"],
            program["structure"]["level"],
        )
        for program in regular
    }
    assert expected <= actual

    outdoor_advanced = [
        program
        for program in regular
        if program["structure"]["location"] == "outdoor"
        and program["structure"]["level"] == "advanced"
    ]
    assert len(outdoor_advanced) == 4
    for sex in ("male", "female"):
        variants = [
            program for program in outdoor_advanced
            if program["structure"]["sex"] == [sex]
        ]
        assert {program["workout_type"] for program in variants} == {
            "strength", "conditioning",
        }
        assert all(program["structure"]["days_per_week"] == 3 for program in variants)
        assert all(program["structure"]["equipment"] == ["bodyweight"] for program in variants)


def test_gym_no_knee_programs_use_loaded_knee_sparing_leg_variants() -> None:
    exercise_rows = json.loads((SEED / "exercises.json").read_text(encoding="utf-8"))
    exercises = {row["name_ru"]: row for row in exercise_rows}
    expected_variants = {
        "Тяга с канатом между ног",
        "Отведение ноги назад в кроссовере",
        "Обратная гиперэкстензия в тренажёре",
        "Ягодичный мост с гантелью",
    }
    assert expected_variants <= exercises.keys()
    for name in expected_variants - {"Ягодичный мост с гантелью"}:
        animation_url = exercises[name].get("animation_url") or ""
        assert animation_url.startswith("/exercise-gifs/"), name

    programs = json.loads((SEED / "programs.json").read_text(encoding="utf-8"))
    gym_no_knee = [
        program
        for program in programs
        if program["structure"].get("location") == "gym"
        and "no_knee" in program["structure"].get("limitations", [])
    ]
    assert len(gym_no_knee) == 2
    knee_dominant = ("присед", "выпад", "разгибания ног", "жим ногами", "прыж")
    for program in gym_no_knee:
        all_names = [
            item["exercise_name"]
            for day in program["structure"]["schedule"]
            for item in day["exercises"]
        ]
        assert "Ягодичный мост" not in all_names
        assert not any(
            token in exercise_name.lower()
            for exercise_name in all_names
            for token in knee_dominant
        )

    female = next(program for program in gym_no_knee if program["structure"]["sex"] == ["female"])
    female_days = female["structure"]["schedule"]
    assert female_days[0]["exercises"][4]["exercise_name"] == "Отведение ноги назад в кроссовере"
    assert female_days[1]["exercises"][3]["exercise_name"] == "Ягодичный мост с гантелью"
    assert female_days[2]["exercises"][0]["exercise_name"] == "Тяга с канатом между ног"


def test_serious_programs_cover_both_sexes_and_requested_splits() -> None:
    programs = json.loads((SEED / "programs.json").read_text(encoding="utf-8"))
    names = [p["name"] for p in programs]
    assert len(names) == len(set(names))

    titles = {
        "Опытный · Антагонисты 3 дня": 3,
        "Продвинутый · Сплит 5 дней": 5,
        "Продвинутый · Чередование акцентов": 4,
        "Опытный · Тяни/Жми 4 дня": 4,
        "Опытный · Только тренажёры 4 дня": 4,
        "Новичок · Full Body 2 дня": 2,
        "Продвинутый · Powerbuilding 4 дня": 4,
    }
    by_name = {p["name"]: p for p in programs}
    for prefix, sex in (("М", "male"), ("Ж", "female")):
        for title, days in titles.items():
            program = by_name[f"{prefix} · Зал · {title}"]
            structure = program["structure"]
            assert structure["sex"] == [sex]
            assert structure["days_per_week"] == days
            assert len(structure["schedule"]) == days

    for prefix in ("М", "Ж"):
        machine_only = by_name[f"{prefix} · Зал · Опытный · Только тренажёры 4 дня"]
        assert machine_only["structure"]["equipment"] == ["machines"]

        alternating = by_name[f"{prefix} · Зал · Продвинутый · Чередование акцентов"]
        focuses = [day["focus"] for day in alternating["structure"]["schedule"]]
        assert focuses == [
            "chest_emphasis", "legs_emphasis", "back_emphasis", "shoulders_emphasis",
        ]
        assert "3–6" in alternating["description"]


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
