"""Workout and set request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


from app.schemas.workout_target import ExplicitWorkoutTarget
from app.schemas.workout_execution import WorkoutGroup, WorkoutSetMethod, WorkoutExecutionPart, WorkoutExecutionPartResponse


class WorkoutPlanExercise(BaseModel):
    target: ExplicitWorkoutTarget | None = None
    set_methods: list[WorkoutSetMethod] = Field(default_factory=list, max_length=20)
    exercise_id: uuid.UUID
    order: int = Field(..., ge=1)
    target_sets: int = Field(default=3, ge=1, le=20)
    target_reps: str | None = "8-12"
    rest_sec: int = Field(default=60, ge=0, le=600)
    name_ru: str | None = None
    suggested_weight: Decimal | None = Field(default=None, ge=0)
    original_exercise_id: uuid.UUID | None = None
    weight_mode: str | None = Field(default=None, pattern=r"^(total|per_hand)$")
    note: str | None = Field(default=None, max_length=500)


class WorkoutPlan(BaseModel):
    execution_version: Literal[1, 2] = 1
    groups: list[WorkoutGroup] = Field(default_factory=list, max_length=10)
    customization_scopes: list[Literal["program_day", "occurrence"]] = Field(default_factory=list)
    customization_revisions: dict[str, int] = Field(default_factory=dict)
    title: str | None = None
    workout_type: str | None = None
    day_index: int | None = None
    week_phase: str | None = None  # light | medium | heavy
    week_in_cycle: int | None = None
    week_label: str | None = None
    week_rir: str | None = None
    base_week_phase: str | None = None
    load_adjustment: str | None = None
    load_adjustment_label: str | None = None
    location: str | None = None
    equipment: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    exercises: list[WorkoutPlanExercise] = Field(default_factory=list)


    @model_validator(mode="after")
    def validate_execution(self):
        if self.execution_version == 2:
            if not 1 <= len(self.exercises) <= 20:
                raise ValueError("В тренировке должно быть от 1 до 20 упражнений")
            orders = [row.order for row in self.exercises]
            if len(orders) != len(set(orders)) or any(order > 20 for order in orders):
                raise ValueError("Порядок упражнений должен быть уникальным от 1 до 20")
        if not self.groups and not any(row.set_methods for row in self.exercises):
            return self
        if self.execution_version != 2:
            raise ValueError("Для сложной тренировки требуется формат 2")
        ids = [row.exercise_id for row in self.exercises]
        if len(ids) != len(set(ids)):
            raise ValueError("Упражнения плана не должны повторяться")
        for row in self.exercises:
            slots = [method.set_number for method in row.set_methods]
            if len(slots) != len(set(slots)) or any(slot > row.target_sets for slot in slots):
                raise ValueError("Метод должен относиться к существующему подходу")
        by_id = {row.exercise_id: row for row in self.exercises}
        ordered = [row.exercise_id for row in sorted(self.exercises, key=lambda row: row.order)]
        grouped = set()
        group_ids = set()
        for group in self.groups:
            if group.id in group_ids:
                raise ValueError("Идентификаторы связок не должны повторяться")
            group_ids.add(group.id)
            if any(member not in by_id or member in grouped for member in group.exercise_ids):
                raise ValueError("Связка содержит отсутствующее упражнение или пересекается с другой")
            if any(by_id[member].target_sets != group.rounds for member in group.exercise_ids):
                raise ValueError("Число подходов участников должно совпадать с числом раундов")
            start = ordered.index(group.exercise_ids[0])
            if ordered[start:start + len(group.exercise_ids)] != group.exercise_ids:
                raise ValueError("Упражнения связки должны идти подряд в заданном порядке")
            grouped.update(group.exercise_ids)
        return self


class WorkoutPreparationStamp(BaseModel):
    prepared_at: AwareDatetime
    schedule_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    plan_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")


class WorkoutCreate(BaseModel):
    preparation: WorkoutPreparationStamp | None = None
    execution_version: Literal[1, 2] | None = None
    scheduled_date: date
    client_workout_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    day_index: int | None = Field(default=None, ge=1)
    week_phase: str | None = Field(default=None, pattern=r"^(light|medium|heavy)$")
    cycle_readiness: Literal["normal", "caution", "reduce", "rest"] | None = None
    title: str | None = None
    workout_type: str | None = None
    exercise_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description="Optional exercises to pre-create empty set slots for",
    )
    plan: WorkoutPlan | None = None
    sets_per_exercise: int = Field(default=3, ge=1, le=10)

    @model_validator(mode="after")
    def validate_preparation(self):
        if self.preparation is not None and (self.execution_version != 2 or not self.program_id or not self.day_index or not self.client_workout_id or not self.plan or not self.plan.exercises):
            raise ValueError("Сохранённому плану нужны программа, день, версия и идентификатор тренировки")
        return self



class PlannedWorkoutReplacement(BaseModel):
    from_exercise_id: uuid.UUID
    to_exercise_id: uuid.UUID


class PlannedWorkoutPlanRequest(BaseModel):
    program_id: uuid.UUID
    scheduled_date: date
    day_index: int = Field(..., ge=1)
    week_phase: str | None = Field(default=None, pattern=r"^(light|medium|heavy)$")
    replacements: list[PlannedWorkoutReplacement] = Field(default_factory=list, max_length=50)


class WorkoutCompleteRequest(BaseModel):
    execution_version: Literal[1, 2] | None = None
    completed_at: AwareDatetime | None = None
    duration_sec: int | None = Field(default=None, ge=0, le=604800)

    @model_validator(mode="after")
    def validate_confirmation(self):
        if (self.completed_at is None) != (self.duration_sec is None):
            raise ValueError("Передайте время завершения вместе с длительностью")
        if self.completed_at is not None and (self.execution_version != 2 or self.completed_at.year < 2000):
            raise ValueError("Проверьте формат и время завершения")
        return self

    rpe: int | None = Field(default=None, ge=1, le=10)
    ai_notes: str | None = None


class WorkoutUpdateRequest(BaseModel):
    """Editable summary fields for an existing workout."""

    rpe: int | None = Field(default=None, ge=1, le=10)
    ai_notes: str | None = Field(default=None, max_length=5000)


class WorkoutSetCreate(BaseModel):
    execution_version: Literal[1, 2] | None = None
    execution_kind: Literal["standard", "drop", "cluster"] = "standard"
    base_execution_revision: int | None = Field(default=None, ge=0)
    client_operation_id: uuid.UUID | None = None
    parts: list[WorkoutExecutionPart] = Field(default_factory=list, max_length=8)
    exercise_id: uuid.UUID
    set_number: int = Field(..., gt=0)
    reps: int | None = Field(default=None, ge=0, le=100_000)
    weight: Decimal | None = Field(default=None, ge=0, le=10_000)
    weight_mode: str | None = Field(default=None, pattern=r"^(total|per_hand)$")
    rest_time_sec: int | None = Field(default=None, ge=0, le=3600)
    duration_sec: int | None = Field(default=None, ge=0, le=86400)
    note: str | None = Field(default=None, max_length=1000)
    machine_params: dict[str, str | int | float] | None = None
    is_completed: bool = False
    is_skipped: bool = False

    @model_validator(mode="after")
    def validate_skip(self):
        if self.is_skipped and (self.execution_version != 2 or self.is_completed or self.execution_kind != "standard"):
            raise ValueError("Пропуск доступен для обычного участника сложной тренировки; части пропускаются отдельно")
        return self


class WorkoutSetResponse(BaseModel):
    execution_kind: Literal["standard", "drop", "cluster"] | None = "standard"
    execution_revision: int | None = 0
    parts: list[WorkoutExecutionPartResponse] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workout_id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    reps: int | None = None
    weight: Decimal | None = None
    weight_mode: str | None = None
    is_skipped: bool = False
    is_completed: bool
    rest_time_sec: int | None = None
    duration_sec: int | None = None
    note: str | None = None
    machine_params: dict[str, str | int | float] | None = None
    created_at: datetime
    updated_at: datetime


class WorkoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    program_id: uuid.UUID | None = None
    scheduled_date: date
    status: str
    ai_notes: str | None = None
    rpe: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    title: str | None = None
    workout_type: str | None = None
    plan: dict = Field(default_factory=dict)
    duration_sec: int | None = None
    created_at: datetime
    updated_at: datetime
    sets: list[WorkoutSetResponse] = Field(default_factory=list)


class WorkoutHistoryResponse(BaseModel):
    items: list[WorkoutResponse]
    total: int


class ProgressDashboardTotals(BaseModel):
    completed_workouts: int = Field(ge=0)
    active_days: int = Field(ge=0)
    completed_sets: int = Field(ge=0)
    planned_sets: int = Field(ge=0)
    volume_kg: Decimal = Field(ge=0)
    average_rpe: Decimal | None = Field(default=None, ge=1, le=10)
    rpe_workouts: int = Field(ge=0)


class ProgressDashboardWeek(BaseModel):
    week_start: date
    week_end: date
    completed_workouts: int = Field(ge=0)
    completed_sets: int = Field(ge=0)
    planned_sets: int = Field(ge=0)
    volume_kg: Decimal = Field(ge=0)


class ProgressDashboardMuscleGroup(BaseModel):
    muscle_group: str
    completed_sets: int = Field(ge=0)
    exercises: int = Field(ge=0)
    volume_kg: Decimal = Field(ge=0)


class ProgressDashboardResponse(BaseModel):
    period_start: date
    period_end: date
    period_days: Literal[28, 56, 84]
    previous_period_start: date
    previous_period_end: date
    current: ProgressDashboardTotals
    previous: ProgressDashboardTotals
    weeks: list[ProgressDashboardWeek] = Field(default_factory=list, max_length=13)
    muscle_groups: list[ProgressDashboardMuscleGroup] = Field(default_factory=list, max_length=20)
    lifetime_completed_workouts: int = Field(ge=0)
    lifetime_completed_sets: int = Field(ge=0)


ExerciseWeekPhase = Literal["light", "medium", "heavy", "unknown"]


class ExerciseProgressPoint(BaseModel):
    date: date
    weight: Decimal = Field(..., ge=0)
    total_weight: Decimal = Field(..., ge=0)
    reps: int = Field(..., ge=1)
    estimated_1rm: Decimal = Field(..., ge=0)
    weight_mode: Literal["total", "per_hand"] | None = None
    phase: ExerciseWeekPhase


class ExerciseProgressDiarySet(BaseModel):
    set_number: int
    weight: Decimal | None
    total_weight: Decimal | None
    reps: int | None
    weight_mode: Literal["total", "per_hand"] | None = None
    execution_kind: Literal["standard", "drop", "cluster"] = "standard"
    execution_revision: int = 0
    is_completed: bool = True
    parts: list[WorkoutExecutionPart] = Field(default_factory=list)


class ExerciseProgressDiarySession(BaseModel):
    workout_id: uuid.UUID
    date: date
    phase: ExerciseWeekPhase
    sets: list[ExerciseProgressDiarySet]


class ExerciseProgressMetricSummary(BaseModel):
    latest: Decimal | None = None
    best: Decimal | None = None
    change: Decimal | None = None


class ExerciseProgressSummary(BaseModel):
    total_weight: ExerciseProgressMetricSummary
    estimated_1rm: ExerciseProgressMetricSummary


class ExerciseProgressResponse(BaseModel):
    exercise_id: uuid.UUID
    period_start: date
    period_end: date
    points: list[ExerciseProgressPoint]
    summary: ExerciseProgressSummary
    diary: list[ExerciseProgressDiarySession]
    next_diary_cursor: str | None = None


class WorkoutLoadHintsRequest(BaseModel):
    exercise_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=100)


class WorkoutPhaseLoadHint(BaseModel):
    weight: Decimal | None = None
    reps: int | None = None
    duration_sec: int | None = None
    weight_mode: Literal["total", "per_hand"] | None = None
    machine_params: dict[str, str | int | float] | None = None
    rpe: int | None = None
    completed_date: date


class WorkoutLoadHint(BaseModel):
    exercise_id: uuid.UUID
    weight: Decimal | None = None
    reps: int | None = None
    duration_sec: int | None = None
    weight_mode: Literal["total", "per_hand"] | None = None
    machine_params: dict[str, str | int | float] | None = None
    rpe: int | None = None
    completed_date: date
    phase_loads: dict[ExerciseWeekPhase, WorkoutPhaseLoadHint] = Field(default_factory=dict)


class WorkoutLoadHintsResponse(BaseModel):
    items: list[WorkoutLoadHint]
