/** Atomic preparation edits; a running workout keeps its own immutable snapshot. */
import type { Exercise, WorkoutGroup, WorkoutPlan } from "@/types/workout";
import { buildExecutionSteps } from "./workoutExecution";
import { inferLoadType, defaultTimedSeconds } from "./exerciseLoadType";
import { resolveInitialWorkoutTarget } from "./workoutTargets";

export const workoutGroupLabels = { superset: "Суперсет", triset: "Трисет", circuit: "Круговая тренировка" } as const;
export const workoutMethodLabels = { standard: "Обычные подходы", drop: "Дроп-сет", cluster: "Кластеры" } as const;

export function configureWorkoutGroup(plan: WorkoutPlan, group: WorkoutGroup): WorkoutPlan {
  const selected = new Set(group.exercise_ids);
  if (group.exercise_ids.some(id => !plan.exercises.some(row => row.exercise_id === id))) throw new Error("Выберите упражнения из этого дня");
  if (plan.groups?.some(other => other.id !== group.id && other.exercise_ids.some(id => selected.has(id)))) throw new Error("Упражнение уже находится в другой связке");
  const first = plan.exercises.findIndex(row => selected.has(row.exercise_id));
  const before = plan.exercises.slice(0, first).filter(row => !selected.has(row.exercise_id));
  const after = plan.exercises.slice(first).filter(row => !selected.has(row.exercise_id));
  const members = group.exercise_ids.map(id => {
    const row = plan.exercises.find(row => row.exercise_id === id)!;
    return { ...row, target_sets: group.rounds, ...(row.set_methods ? { set_methods: row.set_methods.filter(method => method.set_number <= group.rounds) } : {}) };
  });
  const next: WorkoutPlan = { ...plan, execution_version: 2, groups: [...(plan.groups ?? []).filter(row => row.id !== group.id), group],
    exercises: [...before, ...members, ...after].map((row, i) => ({ ...row, order: i + 1 })) };
  buildExecutionSteps(next);
  return next;
}
export function dissolveWorkoutGroup(plan: WorkoutPlan, groupId: string): WorkoutPlan {
  return { ...plan, groups: (plan.groups ?? []).filter(group => group.id !== groupId) };
}
export function removePreparedExercise(plan: WorkoutPlan, exerciseId: string): WorkoutPlan {
  if (plan.groups?.some(group => group.exercise_ids.includes(exerciseId))) throw new Error("Сначала измените или распустите связку");
  if (plan.exercises.length <= 1) throw new Error("Оставьте хотя бы одно упражнение");
  return { ...plan, exercises: plan.exercises.filter(row => row.exercise_id !== exerciseId).map((row, i) => ({ ...row, order: i + 1 })) };
}
export function updatePreparedExerciseSets(plan: WorkoutPlan, exerciseId: string, count: number): WorkoutPlan {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Укажите от 1 до 20 подходов");
  if (plan.groups?.some(group => group.exercise_ids.includes(exerciseId))) throw new Error("Измените число раундов связки");
  return { ...plan, exercises: plan.exercises.map(row => row.exercise_id !== exerciseId ? row : {
    ...row, target_sets: count, ...(row.set_methods ? { set_methods: row.set_methods.filter(method => method.set_number <= count) } : {}),
  }) };
}
export function replacePreparedExercise(plan: WorkoutPlan, sourceId: string, target: Exercise, restoring = false): WorkoutPlan {
  if (sourceId === target.id) return plan;
  const source = plan.exercises.find(row => row.exercise_id === sourceId);
  if (!source || plan.exercises.some(row => row.exercise_id === target.id)) throw new Error("Упражнение уже есть в этом дне");
  if (source.set_methods?.length && inferLoadType(target) !== "weight_reps") throw new Error("Сначала уберите дроп-сет или кластер: для замены нужны вес и повторы");
  return { ...plan, groups: plan.groups?.map(group => ({ ...group, exercise_ids: group.exercise_ids.map(id => id === sourceId ? target.id : id) })),
    exercises: plan.exercises.map(row => row.exercise_id !== sourceId ? row : { ...row, exercise_id: target.id, name_ru: target.name_ru,
      original_exercise_id: restoring ? null : row.original_exercise_id || row.exercise_id, suggested_weight: null }) };
}


export function workoutPreparationError(plan: WorkoutPlan): string | null {
  try { buildExecutionSteps(plan); return null; }
  catch (err) { return err instanceof Error ? err.message : "Проверьте план тренировки"; }
}


/** Typed time wins; legacy plans retain their exact string and catalog fallback. */
export function preparedTimeSeconds(row: WorkoutPlan["exercises"][number], exercise: Exercise): number {
  const match = /^\s*(\d+)\s*(?:с|сек|секунд|sec)?\s*$/.exec(row.target_reps ?? "");
  const seconds = match ? Number(match[1]) : 0;
  return resolveInitialWorkoutTarget({ row, fallback: { durationSec: seconds >= 1 && seconds <= 86400 ? seconds : defaultTimedSeconds(exercise) } }).durationSec!;
}
