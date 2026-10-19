"""Canonical workout-load math shared by analytics and AI."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Protocol


class LoadSet(Protocol):
    is_completed: bool
    reps: int | None
    weight: Decimal | float | None
    weight_mode: str | None
    duration_sec: int | None


@dataclass(frozen=True)
class WorkoutLoadMetrics:
    weighted_volume_kg_reps: float = 0.0
    weighted_sets: int = 0
    reps_only_reps: int = 0
    reps_only_sets: int = 0
    timed_seconds: int = 0
    timed_sets: int = 0
    weighted_parts: int = 0
    partial_sets: int = 0


_ONE_DECIMAL = Decimal("0.1")


def estimated_one_rep_max(total_weight: Decimal, reps: int) -> Decimal:
    """Return a one-decimal Epley estimate for an already normalized weight."""

    normalized_reps = max(1, min(20, int(reps or 1)))
    if normalized_reps == 1:
        value = total_weight
    else:
        value = total_weight * (Decimal(1) + Decimal(normalized_reps) / Decimal(30))
    return value.quantize(_ONE_DECIMAL, rounding=ROUND_HALF_UP)


def is_standard_set(workout_set: LoadSet) -> bool:
    return (getattr(workout_set, "execution_kind", None) or "standard") == "standard"


def completed_parts(workout_set: LoadSet) -> list:
    if is_standard_set(workout_set) or getattr(workout_set, "is_deleted", False):
        return []
    return [part for part in getattr(workout_set, "parts", []) if part.status == "completed" and not getattr(part, "is_deleted", False)]


def has_recorded_work(workout_set: LoadSet) -> bool:
    if getattr(workout_set, "is_deleted", False):
        return False
    return workout_set.is_completed if is_standard_set(workout_set) else bool(completed_parts(workout_set))


def normalized_set_volume(workout_set: LoadSet) -> float:
    """Actual kg×reps, including partial compounds; normalize per_hand once."""
    if not has_recorded_work(workout_set):
        return 0.0
    values = [workout_set] if is_standard_set(workout_set) else completed_parts(workout_set)
    multiplier = 2 if workout_set.weight_mode == "per_hand" else 1
    return sum(max(0, int(row.reps or 0)) * max(0, float(row.weight or 0)) * multiplier for row in values)


def aggregate_workout_load(sets: Iterable[LoadSet]) -> WorkoutLoadMetrics:
    volume = 0.0
    weighted_sets = 0
    reps_only_reps = 0
    reps_only_sets = 0
    timed_seconds = 0
    timed_sets = 0
    weighted_parts = 0
    partial_sets = 0
    for workout_set in sets:
        if not has_recorded_work(workout_set):
            continue
        if not is_standard_set(workout_set):
            volume += normalized_set_volume(workout_set)
            parts = completed_parts(workout_set)
            weighted_parts += sum(1 for part in parts if (part.reps or 0) > 0 and (part.weight or 0) > 0)
            weighted_sets += int(workout_set.is_completed)
            partial_sets += int(any(part.status != "completed" for part in getattr(workout_set, "parts", []) if not getattr(part, "is_deleted", False)))
            continue
        set_volume = normalized_set_volume(workout_set)
        if set_volume > 0:
            volume += set_volume
            weighted_sets += 1
            continue
        duration = int(workout_set.duration_sec or 0)
        if duration > 0:
            timed_seconds += duration
            timed_sets += 1
            continue
        reps = int(workout_set.reps or 0)
        if reps > 0:
            reps_only_reps += reps
            reps_only_sets += 1
    return WorkoutLoadMetrics(
        weighted_volume_kg_reps=round(volume, 1),
        weighted_sets=weighted_sets,
        reps_only_reps=reps_only_reps,
        reps_only_sets=reps_only_sets,
        timed_seconds=timed_seconds,
        timed_sets=timed_sets,
        weighted_parts=weighted_parts,
        partial_sets=partial_sets,
    )
