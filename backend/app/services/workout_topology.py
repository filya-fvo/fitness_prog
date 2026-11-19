"""Plan active-workout topology changes against authoritative execution facts."""

import json
from hashlib import sha256
from typing import Literal
from uuid import UUID, uuid5

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from app.schemas.workout import WorkoutPlan

TopologyAction = Literal["append_exercise", "replace_member", "replace_group", "resize_exercise", "resize_group"]
PLAN_CHANGED = "План тренировки уже изменился. Записанный результат сохранён на устройстве"


class TopologyStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: UUID
    slot_id: UUID
    exercise_id: UUID
    set_number: int = Field(ge=1, le=20)
    round: int = Field(ge=1, le=20)
    group_id: UUID | None = None
    part_ordinal: int | None = Field(default=None, ge=1, le=8)
    state: Literal["pending", "completed", "skipped"]
    member_id: UUID | None = None


class ActiveTopologyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation_id: UUID
    action: TopologyAction
    subject_id: UUID
    replacement_exercise_id: UUID | None = None
    target_count: int | None = Field(default=None, ge=1, le=20, strict=True)
    expected_plan_revision: int | None = Field(default=None, ge=0)


class ActiveTopologyApply(ActiveTopologyRequest):
    preview_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


def active_topology_fingerprint(plan_revision: int, rows: list[dict]) -> str:
    """Bind confirmation to both topology and states of affected workload."""
    document = json.dumps([plan_revision, rows], sort_keys=True, separators=(",", ":"), default=str)
    return sha256(document.encode()).hexdigest()


def require_active_plan_revision(plan: dict | None, requested_revision: int | None) -> None:
    current_revision = (plan or {}).get("active_plan_revision", 0)
    if (requested_revision if requested_revision is not None else 0) != current_revision:
        raise HTTPException(409, PLAN_CHANGED)


def _pending_step(operation_id, slot_id, exercise_id, number, round_number, group_id, member_id):
    return {
        "step_id": uuid5(operation_id, f"{slot_id}:{number}"),
        "slot_id": slot_id,
        "exercise_id": exercise_id,
        "set_number": number,
        "round": round_number,
        "group_id": group_id,
        "part_ordinal": None,
        "state": "pending",
        "member_id": member_id,
    }


def _replace(selected, steps, operation, target, whole_group):
    if target is None:
        raise HTTPException(422, "Выберите новое упражнение")
    if any(row.exercise_id == target for row in steps):
        raise HTTPException(409, "Это упражнение уже есть в тренировке")
    pending = [row for row in selected if row.state == "pending"]
    if not pending:
        raise HTTPException(409, "В этой части тренировки больше нет незавершённых подходов")
    groups = {}
    for row in pending:
        key = row.round if whole_group else row.set_number
        groups.setdefault(key, row)
    slot_id = uuid5(operation, f"exercise:{target}")
    return {row.step_id: [_pending_step(
        operation, slot_id, target, number, number if whole_group else row.round,
        None if whole_group else row.group_id, None if whole_group else row.member_id or row.slot_id,
    )] for number, row in enumerate(groups.values(), 1)}, pending


def _resize(selected, operation, target_count, group):
    if not isinstance(target_count, int) or isinstance(target_count, bool) or not 1 <= target_count <= 20:
        raise HTTPException(422, "Укажите от 1 до 20 подходов или раундов")
    number = (lambda row: row.round) if group else (lambda row: row.set_number)
    current = max(map(number, selected))
    if target_count <= current:
        removed = [row for row in selected if number(row) > target_count]
        if any(row.state != "pending" for row in removed):
            raise HTTPException(409, "В убираемых подходах есть сохранённые записи")
        return [], removed

    tail = [row for row in selected if number(row) == current]
    members = {row.member_id or row.slot_id: row for row in tail}
    last_numbers = {row.slot_id: max(item.set_number for item in selected if item.slot_id == row.slot_id)
                    for row in members.values()}
    created = [_pending_step(
        operation, row.slot_id, row.exercise_id, last_numbers[row.slot_id] + round_number - current,
        round_number, row.group_id, row.member_id,
    ) for round_number in range(current + 1, target_count + 1) for row in members.values()]
    if any(row["set_number"] > 20 for row in created):
        raise HTTPException(422, "В упражнении не может быть больше 20 подходов")
    return created, []


def preview_active_topology_change(
    rows: list[dict], *, operation_id: UUID, action: TopologyAction, subject_id: UUID,
    replacement_exercise_id: UUID | None = None, target_count: int | None = None,
) -> dict:
    """Never turn mutable client rows into recorded facts. Caller supplies locked server rows."""
    try:
        steps = [TopologyStep.model_validate(row) for row in rows]
    except ValidationError as exc:
        raise HTTPException(409, "Не удалось проверить сохранённый план тренировки") from exc
    if not steps or len(steps) > 3200 or len({row.step_id for row in steps}) != len(steps):
        raise HTTPException(409, "Не удалось проверить сохранённый план тренировки")
    if action not in ("replace_member", "replace_group", "resize_exercise", "resize_group"):
        raise HTTPException(422, "Выберите изменение плана")

    whole_group = action in ("replace_group", "resize_group")
    selected = [row for row in steps if (row.group_id if whole_group else row.slot_id) == subject_id]
    if not selected:
        raise HTTPException(409, "Упражнение или связка отсутствует в сохранённом плане")
    if action == "resize_exercise" and any(row.group_id is not None for row in selected):
        raise HTTPException(422, "Для участника связки измените число раундов")

    additions = {}
    tail = {}
    if action in ("replace_member", "replace_group"):
        additions, removed = _replace(selected, steps, operation_id, replacement_exercise_id, whole_group)
    else:
        created, removed = _resize(selected, operation_id, target_count, whole_group)
        tail[selected[-1].step_id] = created

    removed_ids = {row.step_id for row in removed}
    result = []
    for raw, row in zip(rows, steps, strict=True):
        result.extend(additions.get(row.step_id, ()))
        if row.step_id not in removed_ids:
            result.append(dict(raw))
        result.extend(tail.get(row.step_id, ()))
    return {"steps": result, "removed_step_ids": [row.step_id for row in removed]}


def project_v2_topology(plan: WorkoutPlan, rows: list[dict], request: ActiveTopologyRequest, name: str | None) -> WorkoutPlan:
    """Keep unworked slots in the plan and leave recorded rows attached to the workout."""
    if request.action == "append_exercise":
        if len(plan.exercises) >= 20:
            raise HTTPException(409, "В тренировке уже 20 упражнений")
        if any(row.exercise_id == request.subject_id for row in plan.exercises):
            raise HTTPException(409, "Это упражнение уже есть в плане или истории тренировки")
        exercises = sorted(plan.exercises, key=lambda row: row.order)
        return WorkoutPlan.model_validate({
            **plan.model_dump(),
            "exercises": [
                *(row.model_copy(update={"order": index}) for index, row in enumerate(exercises, 1)),
                {"exercise_id": request.subject_id, "name_ru": name, "order": len(exercises) + 1,
                 "target_sets": request.target_count or 3, "target_reps": None},
            ],
        })
    preview_active_topology_change(rows, **request.model_dump(exclude={"expected_plan_revision"}))
    projected = plan.model_dump(mode="python")
    exercises = sorted(projected["exercises"], key=lambda row: row["order"])
    groups = projected["groups"]
    affected_group = next((group for group in groups if group["id"] == request.subject_id), None)
    if request.action.startswith("replace"):
        whole = request.action == "replace_group"
        selected = set(affected_group["exercise_ids"]) if whole and affected_group else {request.subject_id}
        remaining = sorted({row["set_number"] for row in rows if row["exercise_id"] in selected and row["state"] == "pending"})
        original = next(row for row in exercises if row["exercise_id"] in selected)
        in_group = any(request.subject_id in group["exercise_ids"] for group in groups)
        count = original["target_sets"] if in_group else len(remaining)
        replacement = {
            **original, "exercise_id": request.replacement_exercise_id, "name_ru": name,
            "original_exercise_id": None, "target_sets": count,
            "active_set_numbers": remaining if in_group and len(remaining) != count else None,
            "target": None, "target_reps": None, "suggested_weight": None, "weight_mode": None,
            "set_methods": [], "note": None,
        }
        exercises = [replacement if row is original else row for row in exercises
                     if row is original or row["exercise_id"] not in selected]
        if whole:
            replacement["rest_sec"] = affected_group["round_rest_sec"]
            projected["groups"] = [group for group in groups if group is not affected_group]
        else:
            for group in groups:
                group["exercise_ids"] = [request.replacement_exercise_id if exercise_id in selected else exercise_id
                                         for exercise_id in group["exercise_ids"]]
    else:
        selected = set(affected_group["exercise_ids"]) if affected_group else {request.subject_id}
        if affected_group:
            affected_group["rounds"] = request.target_count
        for row in exercises:
            if row["exercise_id"] in selected:
                if row["active_set_numbers"] is not None:
                    numbers = [number for number in row["active_set_numbers"] if number <= request.target_count]
                    numbers.extend(range(row["target_sets"] + 1, request.target_count + 1))
                    if not numbers:
                        raise HTTPException(409, "Оставьте хотя бы один подход для каждого участника связки")
                    row["active_set_numbers"] = numbers if len(numbers) != request.target_count else None
                row["target_sets"] = request.target_count
                row["set_methods"] = [method for method in row["set_methods"] if method["set_number"] <= request.target_count]
    for order, row in enumerate(exercises, 1):
        row["order"] = order
    projected["exercises"] = exercises
    return WorkoutPlan.model_validate(projected)
