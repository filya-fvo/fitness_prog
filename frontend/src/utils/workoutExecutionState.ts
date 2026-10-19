/** Durable session metadata; result UUIDs are independent of logical step keys. */
import type { ExecutionProgress } from "./workoutExecution";
import { buildExecutionSteps } from "./workoutExecution";
import type { LocalSetDraft, Workout, WorkoutPlan } from "@/types/workout";

export type WorkoutExecutionEnvelope = {
  version: 1;
  owner: string;
  clientWorkoutId: string;
  snapshotKey: string;
  revision: number;
  lastQueuedAt: number;
  viewStepId: string | null;
  progress: ExecutionProgress;
};

export function executionSnapshotKey(plan: WorkoutPlan): string {
  buildExecutionSteps(plan);
  return JSON.stringify({ execution_version: plan.execution_version, day_index: plan.day_index ?? null,
    week_phase: plan.week_phase ?? null, revisions: [plan.customization_revisions?.program_day ?? 0, plan.customization_revisions?.occurrence ?? 0],
    groups: [...(plan.groups ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    exercises: [...plan.exercises].sort((a, b) => a.order - b.order).map(row => ({ exercise_id: row.exercise_id, order: row.order,
      target_sets: row.target_sets, target_reps: row.target_reps ?? null, rest_sec: row.rest_sec ?? 60, weight_mode: row.weight_mode ?? null,
      set_methods: [...(row.set_methods ?? [])].sort((a, b) => a.set_number - b.set_number).map(method => ({ ...method,
        parts: method.parts.map(part => ({ ...part, target_weight: part.target_weight == null ? null : Number(part.target_weight) })) })),
    })),
  });
}

export function ensureExecutionDrafts(workout: Workout, drafts: LocalSetDraft[], newId: () => string): LocalSetDraft[] {
  const plan = workout.plan as WorkoutPlan;
  return drafts.map(draft => {
    const row = plan.exercises.find(row => row.exercise_id === draft.exerciseId);
    const method = row?.set_methods?.find(method => method.set_number === draft.setNumber);
    if (!method) return { ...draft, executionKind: "standard" as const, executionRevision: draft.executionRevision ?? 0 };
    const saved = workout.sets.find(set => set.exercise_id === draft.exerciseId && set.set_number === draft.setNumber);
    const parts = draft.parts?.length ? draft.parts : saved?.parts;
    if (parts?.length && parts.length !== method.parts.length) throw new Error("Сохранённые части не совпадают с планом. Результат сохранён на устройстве");
    if (draft.isCompleted && !parts?.some(part => part.status === "completed")) throw new Error("Старая запись не содержит частей. Проверьте сохранённый результат перед продолжением");
    const nextParts = parts?.length ? parts.map(part => ({ ...part })) : method.parts.map((part, index) => ({
      id: newId(), ordinal: index + 1, reps: null, weight: null, duration_sec: null, status: "pending" as const, rest_after_sec: part.pause_after_sec,
    }));
    return { ...draft, executionKind: method.kind, executionRevision: draft.executionRevision ?? saved?.execution_revision ?? 0,
      reps: "", weight: "", parts: nextParts,
      isCompleted: nextParts.every(part => part.status !== "pending") && nextParts.some(part => part.status === "completed") };
  });
}


/** Common metadata writes cannot replace facts owned by the execution transaction. */
export function mergeExecutionWorkoutMetadata(current: Workout, incoming: Workout, id = current.id): Workout {
  const oldPlan = current.plan as WorkoutPlan & { warmup_pending?: boolean; warmup_log?: unknown };
  const newPlan = incoming.plan as typeof oldPlan;
  return { ...current, id, plan: { ...oldPlan,
    ...(newPlan?.warmup_pending === false ? { warmup_pending: false } : {}),
    ...(oldPlan.warmup_log == null && newPlan?.warmup_log != null ? { warmup_log: newPlan.warmup_log } : {}),
  } };
}
