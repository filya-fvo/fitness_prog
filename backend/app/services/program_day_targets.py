"""Atomic personal-day intent and its compatible execution-plan fields."""
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import TypeAdapter

from app.models.exercise import Exercise
from app.schemas.program import PersonalProgramDay, PersonalProgramExercise
from app.schemas.workout_target import ExplicitWorkoutTarget
from app.services.exercise_load_type import infer_load_type

_TARGET = TypeAdapter(ExplicitWorkoutTarget)


def validate_catalog_intent(days: list[PersonalProgramDay], by_id: dict[UUID, Exercise]) -> None:
    """Run before adding a program; legacy input needs no new catalog attributes."""
    for day in days:
        for item in day.exercises:
            if item.target is None and not item.set_methods:
                continue
            load_type = infer_load_type(by_id[item.exercise_id])
            if item.set_methods and load_type != "weight_reps":
                raise HTTPException(422, "Дроп-сеты и кластеры доступны только для упражнений с весом и повторами")
            if item.target is not None:
                expected_kind = "timed" if load_type == "cardio_machine" else load_type
                if item.target.kind != expected_kind:
                    raise HTTPException(422, "Цель не соответствует типу нагрузки упражнения")


def serialize_exercise_intent(item: PersonalProgramExercise) -> dict[str, Any]:
    """Keep absent optional fields out of legacy JSON; Decimal uses JSON strings."""
    result = {}
    if item.target is not None:
        result["target"] = item.target.model_dump(mode="json")
    if item.set_methods:
        result["set_methods"] = [method.model_dump(mode="json") for method in item.set_methods]
    if item.weight_mode is not None:
        result["weight_mode"] = item.weight_mode
    return result


def apply_exercise_intent(item: dict[str, Any], row: dict[str, Any]) -> None:
    """Explicit intent wins over phase defaults while history remains independent."""
    if item.get("target") is not None:
        target = _TARGET.validate_python(item["target"])
        row["target"] = target.model_dump(mode="json")
        if target.kind == "timed":
            row["target_reps"] = f"{target.duration_sec}с"
        else:
            row["target_reps"] = (
                str(target.reps_min) if target.reps_min == target.reps_max
                else f"{target.reps_min}-{target.reps_max}"
            )
    if item.get("set_methods"):
        row["set_methods"] = item["set_methods"]


def execution_fields(day: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not day.get("groups") and not any(row.get("target") or row.get("set_methods") for row in rows):
        return {}
    for row in rows:
        row.setdefault("set_methods", [])
    return {"execution_version": 2, "groups": day.get("groups") or []}
