"""Canonical workout-load math shared by analytics and AI."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
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


def normalized_set_volume(workout_set: LoadSet) -> float:
    """Return kg×reps only for a completed weighted set.

    A weight saved as ``per_hand`` represents one implement and is doubled.
    Reps-only and timed work deliberately return zero instead of being mixed
    into an artificial common load.
    """
    if not workout_set.is_completed:
        return 0.0
    reps = int(workout_set.reps or 0)
    weight = float(workout_set.weight or 0)
    if reps <= 0 or weight <= 0:
        return 0.0
    multiplier = 2 if workout_set.weight_mode == "per_hand" else 1
    return reps * weight * multiplier


def aggregate_workout_load(sets: Iterable[LoadSet]) -> WorkoutLoadMetrics:
    volume = 0.0
    weighted_sets = 0
    reps_only_reps = 0
    reps_only_sets = 0
    timed_seconds = 0
    timed_sets = 0
    for workout_set in sets:
        if not workout_set.is_completed:
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
    )
