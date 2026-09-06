"""Optional, symptom-led menstrual-cycle training adjustments.

Calendar phase is deliberately not inferred: cycle length and individual response
vary too much for a fixed four-week prescription.  A user can instead record how
cycle-related symptoms affect today's readiness, and the planned load is capped
without changing the underlying program cursor.
"""

from __future__ import annotations

from typing import Any


CYCLE_READINESS_VALUES = {"normal", "caution", "reduce", "rest"}
PHASE_ORDER = {"light": 0, "medium": 1, "heavy": 2}


def normalize_cycle_readiness(value: object) -> str | None:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in CYCLE_READINESS_VALUES else None


def cycle_training_enabled(
    goals: dict[str, Any] | None,
    anthropometry: dict[str, Any] | None = None,
) -> bool:
    """Allow the private option only for female or unspecified profiles."""

    if (goals or {}).get("cycle_training_enabled") is not True:
        return False
    raw_sex = (anthropometry or {}).get("sex") or (goals or {}).get("sex")
    sex = str(raw_sex or "").strip().lower().replace("ё", "е")
    is_male = sex in {"m", "male", "man", "м", "муж", "мужской"} or sex.startswith("муж")
    return not is_male


def adapt_week_phase(base_phase: str, readiness: object) -> dict[str, str] | None:
    """Return adaptation metadata, or ``None`` when the plan stays unchanged."""

    base = str(base_phase or "medium").strip().lower()
    if base not in PHASE_ORDER:
        base = "medium"
    value = normalize_cycle_readiness(readiness)
    if value in {None, "normal"}:
        return None

    if value == "caution":
        effective = "medium" if base == "heavy" else base
        label = "По самочувствию: без предельной нагрузки"
    elif value == "reduce":
        effective = "light"
        label = "По самочувствию: лёгкая нагрузка"
    else:
        effective = "light"
        label = "Сегодня приоритет — восстановление"

    if effective == base and value == "caution":
        return None
    return {
        "base_week_phase": base,
        "week_phase": effective,
        "load_adjustment": f"cycle_{value}",
        "load_adjustment_label": label,
    }
