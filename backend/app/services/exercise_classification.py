"""Compatible exercise metadata and program structure analysis.

The catalog keeps classification in tags so existing API clients and database
rows remain compatible. Structured prefixes are deterministic and can later be
moved to dedicated columns without changing their meaning.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable, Mapping


TAG_PREFIXES = ("primary:", "secondary:", "pattern:", "role:", "equipment:")
PROGRAM_EQUIPMENT = {"bodyweight", "bands", "dumbbells", "barbell", "machines", "kettlebell"}


@dataclass(frozen=True)
class ExerciseClassification:
    primary_muscles: tuple[str, ...]
    secondary_muscles: tuple[str, ...]
    movement_pattern: str
    exercise_role: str
    equipment: str
    unilateral: bool


@dataclass(frozen=True)
class ProgramStructureReport:
    direct_sets: dict[str, int]
    pattern_sets: dict[str, int]
    required_equipment: tuple[str, ...]
    estimated_minutes: int


def _value(record: object, key: str, default: Any = None) -> Any:
    if isinstance(record, Mapping):
        return record.get(key, default)
    return getattr(record, key, default)


def _tags(record: object) -> list[str]:
    raw = _value(record, "tags", [])
    return [str(value) for value in raw] if isinstance(raw, list) else []


def _tag_values(tags: Iterable[str], prefix: str) -> tuple[str, ...]:
    values = [tag[len(prefix):] for tag in tags if tag.startswith(prefix) and tag[len(prefix):]]
    return tuple(dict.fromkeys(values))


def canonical_equipment(value: object) -> str:
    text = str(value or "").strip().casefold()
    if any(token in text for token in ("резин", "эспандер", "band")):
        return "bands"
    if any(token in text for token in ("гантел", "dumbbell")):
        return "dumbbells"
    if any(token in text for token in ("штанг", "ez", "barbell")):
        return "barbell"
    if any(token in text for token in ("гир", "kettlebell")):
        return "kettlebell"
    if any(token in text for token in (
        "тренаж", "машина", "блок", "кроссовер", "дорожка", "эллипс",
        "велотрен", "cable", "smith", "machine", "leverage",
    )):
        return "machines"
    return "bodyweight"


def _movement_pattern(name: str, muscle_group: str) -> str:
    text = name.casefold()
    if "присед" in text and "жим" in text:
        return "squat_to_press"
    if "сведение ног" in text:
        return "hip_adduction"
    if "разведение ног" in text or "отведение ноги назад" in text:
        return "hip_abduction" if "разведение" in text else "hip_extension"
    if "подъём" in text and "нос" in text:
        return "calf_raise"
    if any(token in text for token in ("выпад", "болгарск", "зашаг")):
        return "lunge"
    if "жим ногами" in text or "гакк" in text or "присед" in text:
        return "squat"
    if "сгибания ног" in text:
        return "knee_flexion"
    if "разгибания ног" in text:
        return "knee_extension"
    if any(token in text for token in (
        "становая", "румынская", "гиперэкстенз", "канатом между ног",
    )):
        return "hinge"
    if "ягодичный мост" in text:
        return "hip_extension"
    if "подтягив" in text or "тяга верхнего блока" in text:
        return "vertical_pull"
    if any(token in text for token in (
        "тяга горизонт", "тяга штанги", "тяга гантел", "тяга т-грифа",
        "тяга с упором", "тяга резинки", "тяга к лицу",
    )):
        return "horizontal_pull"
    if "жим" in text and any(token in text for token in ("стоя", "сидя", "вверх", "арнольд")):
        return "vertical_push"
    if "жим" in text or "отжим" in text or "сведение рук" in text or "разведение гантелей лёжа" in text:
        return "horizontal_push"
    if any(token in text for token in ("сгибания гантел", "сгибания со штанг", "молотков", "скотта", "сгибания на нижнем")):
        return "elbow_flexion"
    if any(token in text for token in ("разгибания на блоке", "разгибания из-за", "французский", "жим вниз")):
        return "elbow_extension"
    if any(token in text for token in ("разводка", "махи гантел", "отведение руки", "подъёмы гантелей", "шраги", "тяга к подбородку")):
        return "shoulder_accessory"
    if any(token in text for token in ("планка", "мёртвый жук", "птица-собака", "лодочк", "паллофа")):
        return "core_stability"
    if any(token in text for token in ("скручив", "велосипед", "подъёмы ног")):
        return "core_flexion"
    if muscle_group == "кардио" or any(token in text for token in (
        "бёрпи", "колени", "скакал", "прыж", "дорожка", "эллипс",
        "велотрен", "скейтер", "фермерская", "медвежья", "махи гирей",
    )):
        return "conditioning"
    if muscle_group == "мобильность" or any(token in text for token in (
        "мобилизац", "растяж", "поза ", "кошка-корова", "наклоны", "раскрытие",
    )):
        return "mobility"
    return "other"


def _primary_muscles(pattern: str, muscle_group: str, name: str) -> tuple[str, ...]:
    by_pattern = {
        "hip_adduction": ("adductors",),
        "hip_abduction": ("gluteus_medius",),
        "calf_raise": ("calves",),
        "lunge": ("quadriceps", "glutes"),
        "squat": ("quadriceps", "glutes"),
        "knee_flexion": ("hamstrings",),
        "knee_extension": ("quadriceps",),
        "hinge": ("hamstrings", "glutes"),
        "hip_extension": ("glutes",),
        "vertical_pull": ("back",),
        "horizontal_pull": ("back",),
        "vertical_push": ("deltoids",),
        "elbow_flexion": ("biceps",),
        "elbow_extension": ("triceps",),
        "shoulder_accessory": ("deltoids",),
        "core_stability": ("core",),
        "core_flexion": ("core",),
        "conditioning": ("cardiovascular",),
        "mobility": ("mobility",),
        "squat_to_press": ("quadriceps", "glutes", "deltoids"),
    }
    if pattern == "horizontal_push":
        return ("triceps",) if "узким хватом" in name.casefold() else ("chest",)
    if pattern in by_pattern:
        return by_pattern[pattern]
    fallback = {
        "ноги": "legs", "грудь": "chest", "спина": "back", "плечи": "deltoids",
        "бицепс": "biceps", "трицепс": "triceps", "кор": "core",
        "кардио": "cardiovascular", "мобильность": "mobility", "full_body": "full_body",
    }
    return (fallback.get(muscle_group, "other"),)


def _secondary_muscles(pattern: str, primary: tuple[str, ...]) -> tuple[str, ...]:
    values = {
        "hip_adduction": ("glutes",),
        "hip_abduction": ("glutes", "core"),
        "lunge": ("hamstrings", "core"),
        "squat": ("hamstrings", "core"),
        "squat_to_press": ("triceps", "core"),
        "knee_flexion": ("calves",),
        "knee_extension": ("glutes",),
        "hinge": ("back", "core"),
        "hip_extension": ("hamstrings", "core"),
        "vertical_pull": ("biceps", "forearms"),
        "horizontal_pull": ("biceps", "rear_deltoids"),
        "vertical_push": ("triceps", "upper_chest"),
        "horizontal_push": ("triceps", "deltoids"),
        "elbow_flexion": ("forearms",),
        "elbow_extension": ("deltoids",),
        "shoulder_accessory": ("trapezius",),
        "core_stability": ("back", "glutes"),
        "core_flexion": ("hip_flexors",),
        "conditioning": ("full_body",),
    }.get(pattern, ())
    return tuple(value for value in values if value not in primary)


def classify_exercise(record: object) -> ExerciseClassification:
    tags = _tags(record)
    name = str(_value(record, "name_ru", ""))
    muscle_group = str(_value(record, "muscle_group", "")).casefold()
    explicit_pattern = _tag_values(tags, "pattern:")
    pattern = explicit_pattern[0] if explicit_pattern else _movement_pattern(name, muscle_group)
    primary = _tag_values(tags, "primary:") or _primary_muscles(pattern, muscle_group, name)
    secondary = _tag_values(tags, "secondary:")
    if not secondary:
        raw_secondary = _value(record, "secondary_muscle_groups", [])
        if isinstance(raw_secondary, list):
            secondary = tuple(str(item).strip().casefold() for item in raw_secondary if str(item).strip())
    if not secondary:
        secondary = _secondary_muscles(pattern, primary)
    explicit_role = _tag_values(tags, "role:")
    if explicit_role:
        role = explicit_role[0]
    elif pattern == "mobility":
        role = "mobility"
    elif pattern == "conditioning":
        role = "conditioning"
    elif pattern.startswith("core_"):
        role = "core"
    elif pattern in {"squat", "squat_to_press", "hinge", "lunge", "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull"}:
        role = "main"
    else:
        role = "accessory"
    explicit_equipment = _tag_values(tags, "equipment:")
    equipment = explicit_equipment[0] if explicit_equipment else canonical_equipment(_value(record, "equipment"))
    unilateral = "unilateral" in tags or "/стор" in name.casefold()
    return ExerciseClassification(primary, secondary, pattern, role, equipment, unilateral)


def enrich_seed_metadata(row: dict[str, Any]) -> dict[str, Any]:
    classification = classify_exercise(row)
    preserved = [tag for tag in _tags(row) if not tag.startswith(TAG_PREFIXES)]
    structured = [
        *(f"primary:{value}" for value in classification.primary_muscles),
        *(f"secondary:{value}" for value in classification.secondary_muscles),
        f"pattern:{classification.movement_pattern}",
        f"role:{classification.exercise_role}",
        f"equipment:{classification.equipment}",
    ]
    if classification.unilateral and "unilateral" not in preserved:
        preserved.append("unilateral")
    row["tags"] = list(dict.fromkeys([*preserved, *structured]))
    return row


def build_program_structure_report(
    schedule: object,
    exercises_by_name: Mapping[str, object],
) -> ProgramStructureReport:
    direct_sets: Counter[str] = Counter()
    pattern_sets: Counter[str] = Counter()
    equipment: set[str] = set()
    total_seconds = 0
    if not isinstance(schedule, list):
        schedule = []
    for day in schedule:
        if not isinstance(day, Mapping):
            continue
        for item in day.get("exercises") or []:
            if not isinstance(item, Mapping):
                continue
            exercise = exercises_by_name.get(str(item.get("exercise_name") or ""))
            if exercise is None:
                continue
            classification = classify_exercise(exercise)
            try:
                sets = max(0, int(item.get("sets", item.get("target_sets", 0))))
                rest = max(0, int(item.get("rest_sec", 0)))
            except (TypeError, ValueError):
                continue
            for muscle in classification.primary_muscles:
                direct_sets[muscle] += sets
            pattern_sets[classification.movement_pattern] += sets
            equipment.add(classification.equipment)
            # A stable planning estimate: ~40 seconds of work plus the stated rest per set.
            total_seconds += sets * (40 + rest)
    return ProgramStructureReport(
        direct_sets=dict(sorted(direct_sets.items())),
        pattern_sets=dict(sorted(pattern_sets.items())),
        required_equipment=tuple(sorted(equipment)),
        estimated_minutes=max(1, round(total_seconds / 60)),
    )
