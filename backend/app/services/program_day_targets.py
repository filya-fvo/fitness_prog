"""Atomic personal-day intent and its compatible execution-plan fields."""
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import TypeAdapter
from sqlalchemy import select

from app.models.exercise import Exercise
from app.schemas.program import PersonalProgramDay, PersonalProgramExercise
from app.schemas.workout_target import ExplicitWorkoutTarget
from app.services.exercise_load_type import infer_load_type

_TARGET = TypeAdapter(ExplicitWorkoutTarget)


def validate_exercise_catalog_intent(target, set_methods, exercise: Exercise) -> None:
    """The same load contract applies to original and preserved replacement intent."""
    if target is None and not set_methods:
        return
    load_type = infer_load_type(exercise)
    if set_methods and load_type != "weight_reps":
        raise HTTPException(422, "Дроп-сеты и кластеры доступны только для упражнений с весом и повторами")
    if target is not None:
        expected_kind = "timed" if load_type == "cardio_machine" else load_type
        if _TARGET.validate_python(target).kind != expected_kind:
            raise HTTPException(422, "Цель не соответствует типу нагрузки упражнения. Выберите упражнение с совместимым типом нагрузки")


def validate_catalog_intent(days: list[PersonalProgramDay], by_id: dict[UUID, Exercise]) -> None:
    """Run before adding a program; legacy input needs no new catalog attributes."""
    for day in days:
        for item in day.exercises:
            validate_exercise_catalog_intent(item.target, item.set_methods, by_id[item.exercise_id])


async def validate_plan_catalog_intent(session, plan: dict[str, Any]) -> None:
    """Recheck all retained intent against the final live catalog before a draft write."""
    rows = [row for row in plan.get("exercises", []) if row.get("target") is not None or row.get("set_methods")]
    if not rows:
        return
    ids = {UUID(str(row["exercise_id"])) for row in rows}
    result = await session.scalars(select(Exercise).where(Exercise.id.in_(ids), Exercise.is_deleted.is_(False)))
    catalog = {exercise.id: exercise for exercise in result.all()}
    if set(catalog) != ids:
        raise HTTPException(422, "Одно из упражнений больше недоступно. Выберите другое")
    for row in rows:
        validate_exercise_catalog_intent(row.get("target"), row.get("set_methods"), catalog[UUID(str(row["exercise_id"]))])


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
        apply_legacy_target_note(row)
    if item.get("set_methods"):
        row["set_methods"] = item["set_methods"]


def execution_fields(day: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not day.get("groups") and not any(row.get("target") or row.get("set_methods") for row in rows):
        return {}
    for row in rows:
        row.setdefault("set_methods", [])
    return {"execution_version": 2, "groups": day.get("groups") or []}


def apply_legacy_target_note(row: dict[str, Any]) -> None:
    """Readable manual-entry goal for clients whose plan parser predates target."""
    if row.get("target") is None:
        return
    target = _TARGET.validate_python(row["target"])
    if target.kind != "weight_reps" or target.target_weight is None:
        return
    weight = format(target.target_weight.normalize(), "f")
    mode = {"per_hand": " на руку", "total": " суммарно"}.get(row.get("weight_mode"), "")
    suffix = f"Цель: {weight} кг{mode}"
    note = row.get("note") or ""
    if note != suffix and not note.endswith("\n" + suffix):
        row["note"] = f"{note}\n{suffix}" if note else suffix


def with_readable_target_notes(plan: dict[str, Any]) -> dict[str, Any]:
    """Finalize after private note overrides, before stamps or set-slot seeding."""
    for row in plan.get("exercises", []):
        apply_legacy_target_note(row)
    return plan
