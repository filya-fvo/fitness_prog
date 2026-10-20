/** Durable session metadata; result UUIDs are independent of logical step keys. */
import type { LocalWorkoutSession } from "@/db/schema";
import { executionFactsFromDrafts, draftsFromWorkoutSnapshot } from "./workoutSession";
import { restoreExecutionRest, type ClockSnapshot } from "./workoutRest";
import { executionPartSchema } from "@/api/workoutExecutionSchemas";
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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function executionSnapshotKey(plan: WorkoutPlan): string {
  buildExecutionSteps(plan);
  return canonicalJson({ execution_version: plan.execution_version, day_index: plan.day_index ?? null,
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
  const bySlot = new Map(drafts.map(draft => [`${draft.exerciseId}/${draft.setNumber}`, draft]));
  const completeDrafts = [...drafts, ...draftsFromWorkoutSnapshot(workout).filter(draft => !bySlot.has(`${draft.exerciseId}/${draft.setNumber}`))];
  return completeDrafts.map(draft => {
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


/** Reject damaged or future state before hydration; retain the durable record for recovery. */
export function assertExecutionSessionSnapshot(session: LocalWorkoutSession, owner: string, now: ClockSnapshot): void {
  const plan = session.workout.plan as WorkoutPlan;
  const value = session.execution;
  const invalid = (): never => { throw new Error("Не удалось проверить сохранённое выполнение. Результат остался на устройстве"); };
  if (plan?.execution_version !== 2 || !value || value.version !== 1 || value.owner !== owner || value.clientWorkoutId !== session.clientId ||
    session.ownerUserId !== owner || session.workout.user_id !== owner || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !Number.isSafeInteger(value.lastQueuedAt) || value.lastQueuedAt < 0 || !value.progress) invalid();
  let key: string;
  try { key = canonicalJson(JSON.parse(value!.snapshotKey)); } catch { return invalid(); }
  if (key !== executionSnapshotKey(plan)) invalid();
  const steps = buildExecutionSteps(plan);
  const byId = new Map(steps.map(step => [step.id, step]));
  const progress = value!.progress;
  if (!progress.facts || Object.keys(progress.facts).length !== steps.length || typeof progress.manualContinue !== "boolean" ||
    !Array.isArray(progress.processedActionIds) || progress.processedActionIds.length > 16000 ||
    progress.processedActionIds.some(id => typeof id !== "string" || !id.length || id.length > 128) ||
    new Set(progress.processedActionIds).size !== progress.processedActionIds.length ||
    (value!.viewStepId !== null && !byId.has(value!.viewStepId))) invalid();
  const drafts = new Map(session.drafts.map(draft => [`${draft.exerciseId}/${draft.setNumber}`, draft]));
  if (drafts.size !== session.drafts.length) invalid();
  for (const row of plan.exercises) for (let number = 1; number <= row.target_sets; number++) {
    const draft = drafts.get(`${row.exercise_id}/${number}`);
    if (!draft || !Number.isSafeInteger(draft.executionRevision) || draft.executionRevision! < 0) invalid();
    const method = row.set_methods?.find(method => method.set_number === number);
    if (draft!.executionKind !== (method?.kind ?? "standard")) invalid();
    if (!method) { if (draft!.parts?.length) invalid(); continue; }
    const parts = draft!.parts;
    if (!parts || parts.length !== method.parts.length || new Set(parts.map(part => part.id)).size !== parts.length) invalid();
    for (const [index, part] of parts!.entries()) {
      if (!executionPartSchema.safeParse(part).success || part.ordinal !== index + 1 || part.rest_after_sec !== method.parts[index].pause_after_sec ||
        (part.status === "completed" && (!(part.reps && part.reps > 0) || !(part.weight && part.weight > 0)))) invalid();
    }
    const known = parts!.flatMap(part => part.weight === null ? [] : [part.weight]);
    if (method.kind === "cluster" ? new Set(known).size > 1 : known.some((weight, index) => index > 0 && known[index - 1] <= weight)) invalid();
    if (draft!.isCompleted !== (parts!.every(part => part.status !== "pending") && parts!.some(part => part.status === "completed"))) invalid();
  }
  const derived = executionFactsFromDrafts(plan, session.drafts, progress.facts);
  for (const step of steps) if (!["pending", "completed", "skipped"].includes(progress.facts[step.id]) || progress.facts[step.id] !== derived[step.id]) invalid();
  if (progress.cursor !== (steps.find(step => progress.facts[step.id] === "pending")?.id ?? null)) invalid();
  const last = progress.lastAction;
  if (last) {
    const source = byId.get(last.stepId);
    if (!source || !progress.processedActionIds.includes(last.actionId) || !last.previousFacts || !Object.keys(last.previousFacts).length) invalid();
    for (const [id, status] of Object.entries(last.previousFacts)) {
      const target = byId.get(id);
      if (!target || target.exerciseId !== source!.exerciseId || target.setNumber !== source!.setNumber || !["pending", "completed", "skipped"].includes(status)) invalid();
    }
  }
  if (progress.rest) {
    const rest = restoreExecutionRest(progress.rest, { owner, clientWorkoutId: session.clientId }, now);
    if (!rest || !progress.processedActionIds.includes(rest.sourceActionId) || rest.targetStep.id !== progress.cursor ||
      canonicalJson(rest.targetStep) !== canonicalJson(byId.get(rest.targetStep.id))) invalid();
  }
}
