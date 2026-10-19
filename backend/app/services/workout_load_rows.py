"""One SQL projection of performed work. Compound parents never duplicate their parts."""
from sqlalchemy import Integer, and_, case, cast, exists, func, literal, or_, select, union_all
from sqlalchemy.dialects.postgresql import UUID
from app.models.workout import WorkoutSet
from app.models.workout_set_part import WorkoutSetPart


def standard_set_filter():
    return func.coalesce(WorkoutSet.execution_kind, "standard") == "standard"


def effective_load_rows():
    parent = WorkoutSet
    part = WorkoutSetPart
    common = [parent.id.label("parent_id"), parent.workout_id, parent.exercise_id, parent.set_number,
        parent.execution_kind, parent.weight_mode, parent.is_completed.label("parent_completed")]
    ordinary = select(*common, cast(literal(None), UUID).label("part_id"), cast(literal(None), Integer).label("ordinal"),
        parent.reps, parent.weight, parent.duration_sec).where(parent.is_deleted.is_(False), parent.is_completed.is_(True), standard_set_filter())
    compound = select(*common, part.id.label("part_id"), part.ordinal, part.reps, part.weight, part.duration_sec).join(
        part, part.workout_set_id == parent.id).where(parent.is_deleted.is_(False), parent.execution_kind.in_(["drop", "cluster"]),
        part.is_deleted.is_(False), part.status == "completed")
    return union_all(ordinary, compound).cte("effective_load_rows")


def effective_volume(rows):
    return func.coalesce(rows.c.reps, 0) * func.coalesce(rows.c.weight, 0) * case((rows.c.weight_mode == "per_hand", 2), else_=1)


def completed_parent_count(rows):
    return func.count(func.distinct(case((rows.c.parent_completed.is_(True), rows.c.parent_id), else_=None)))


def performed_set_filter():
    return or_(and_(standard_set_filter(), WorkoutSet.is_completed.is_(True)),
        and_(WorkoutSet.execution_kind.in_(["drop", "cluster"]), exists(select(WorkoutSetPart.id).where(
            WorkoutSetPart.workout_set_id == WorkoutSet.id, WorkoutSetPart.status == "completed", WorkoutSetPart.is_deleted.is_(False)))))
