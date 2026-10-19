/** One ordered execution model for preview, web runtime and the native shared client. */
import type { WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";
import { createExecutionRest, remainingRestMs, executionRestNeedsConfirmation, type ClockSnapshot, type RestKind, type RestState } from "./workoutRest";

export type ExecutionStep = {
  id: string;
  blockId: string;
  round: number;
  exerciseId: string;
  setNumber: number;
  /** Logical slot key; recorded parts retain their separate UUIDs. */
  partId: string | null;
  partOrdinal: number | null;
  kind: "standard" | "drop" | "cluster";
  pauseAfterSec: number;
  exerciseRestSec: number;
};
export type ExecutionStatus = "pending" | "completed" | "skipped";
export type ExecutionFacts = Record<string, ExecutionStatus>;
export type ExecutionUndo = { actionId: string; stepId: string; previousFacts: ExecutionFacts };
export type ExecutionProgress = {
  manualContinue: boolean;
  facts: ExecutionFacts;
  cursor: string | null;
  rest: RestState | null;
  processedActionIds: string[];
  lastAction: ExecutionUndo | null;
};
export type TransitionInput = {
  plan: WorkoutPlan;
  facts: ExecutionFacts;
  cursor: string | null;
  stepId: string;
  action: "complete" | "skip" | "skip_participant" | "correct" | "undo";
  actionId: string;
  undoActionId?: string;
  confirmedAt: ClockSnapshot;
  owner: string;
  clientWorkoutId: string;
  rest: RestState | null;
  processedActionIds?: string[];
  lastAction?: ExecutionUndo | null;
  autoAdvance?: boolean;
  manualContinue?: boolean;
};
export type TransitionDecision = ExecutionProgress & {
  accepted: boolean;
  blockedReason: "duplicate" | "active_rest" | "stale_step" | "undo_unavailable" | "history_limit" | "invalid_action" | null;
  nextStep: ExecutionStep | null;
  restKind: RestKind | null;
  durationSec: number;
  terminal: boolean;
  manualContinue: boolean;
};

function integer(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
function invalid(): never { throw new Error("Проверьте упражнения, связки и части подходов"); }

function validatePlan(plan: WorkoutPlan): WorkoutPlanExercise[] {
  if (!Array.isArray(plan.exercises) || plan.exercises.length < 1 || plan.exercises.length > 20) invalid();
  const rows = [...plan.exercises].sort((a, b) => a.order - b.order);
  const ids = rows.map(row => row.exercise_id);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length || new Set(rows.map(row => row.order)).size !== rows.length) invalid();
  if ((plan.groups?.length || rows.some(row => row.set_methods?.length)) && plan.execution_version !== 2) invalid();
  for (const row of rows) {
    if (!integer(row.order, 1, 20) || !integer(row.target_sets, 1, 20) || !integer(row.rest_sec ?? 60, 0, 600)) invalid();
    const methods = row.set_methods ?? [];
    if (methods.length > 20 || new Set(methods.map(method => method.set_number)).size !== methods.length) invalid();
    for (const method of methods) {
      if (!integer(method.set_number, 1, row.target_sets) || !["drop", "cluster"].includes(method.kind) || method.parts.length < 2 || method.parts.length > 8) invalid();
      const weights = method.parts.flatMap(part => part.target_weight == null ? [] : [part.target_weight]);
      for (const part of method.parts) {
        if (!integer(part.target_reps, 1, 100_000) || !integer(part.pause_after_sec, 0, 600)) invalid();
        if (part.target_weight != null && (!Number.isFinite(part.target_weight) || part.target_weight <= 0 || part.target_weight > 10_000 || Math.abs(part.target_weight * 100 - Math.round(part.target_weight * 100)) > 1e-7)) invalid();
      }
      if (method.parts.at(-1)?.pause_after_sec !== 0) invalid();
      if (method.kind === "cluster" && new Set(weights).size > 1) invalid();
      if (method.kind === "drop" && weights.some((weight, index) => index > 0 && weights[index - 1] <= weight)) invalid();
    }
  }
  const groups = plan.groups ?? [];
  if (groups.length > 10 || new Set(groups.map(group => group.id)).size !== groups.length) invalid();
  const grouped = new Set<string>();
  for (const group of groups) {
    const count = group.exercise_ids.length;
    if (!group.id || !["superset", "triset", "circuit"].includes(group.kind) || count < 2 || count > 20 || new Set(group.exercise_ids).size !== count ||
        (group.kind === "superset" && count !== 2) || (group.kind === "triset" && count !== 3) || !integer(group.rounds, 1, 20) ||
        !integer(group.transition_sec, 0, 600) || !integer(group.round_rest_sec, 0, 600)) invalid();
    const start = ids.indexOf(group.exercise_ids[0]);
    if (start < 0 || group.exercise_ids.some((id, i) => ids[start + i] !== id || grouped.has(id) || rows[start + i]?.target_sets !== group.rounds)) invalid();
    group.exercise_ids.forEach(id => grouped.add(id));
  }
  return rows;
}

export function executionStepId(exerciseId: string, setNumber: number, partOrdinal: number | null = null): string {
  return `${exerciseId}/set/${setNumber}${partOrdinal === null ? "" : `/part/${partOrdinal}`}`;
}

export function buildExecutionSteps(plan: WorkoutPlan): ExecutionStep[] {
  const rows = validatePlan(plan);
  const groups = plan.groups ?? [];
  const steps: ExecutionStep[] = [];
  const append = (row: WorkoutPlanExercise, setNumber: number, blockId: string, round: number) => {
    const method = row.set_methods?.find(method => method.set_number === setNumber);
    const ordinals = method ? method.parts.map((_, index) => index + 1) : [null];
    for (const ordinal of ordinals) steps.push({
      id: executionStepId(row.exercise_id, setNumber, ordinal), blockId, round, exerciseId: row.exercise_id, setNumber,
      partId: ordinal === null ? null : executionStepId(row.exercise_id, setNumber, ordinal), partOrdinal: ordinal,
      kind: method?.kind ?? "standard", pauseAfterSec: ordinal === null ? 0 : method!.parts[ordinal - 1].pause_after_sec,
      exerciseRestSec: row.rest_sec ?? 60,
    });
  };
  for (const row of rows) {
    const group = groups.find(group => group.exercise_ids.includes(row.exercise_id));
    if (group) {
      if (group.exercise_ids[0] !== row.exercise_id) continue;
      for (let round = 1; round <= group.rounds; round++) {
        for (const member of group.exercise_ids) append(rows.find(row => row.exercise_id === member)!, round, group.id, round);
      }
    } else {
      for (let setNumber = 1; setNumber <= row.target_sets; setNumber++) append(row, setNumber, `exercise:${row.exercise_id}`, setNumber);
    }
  }
  return steps;
}

function pauseFor(plan: WorkoutPlan, source: ExecutionStep, target: ExecutionStep | null): { restKind: RestKind | null; durationSec: number } {
  if (!target) return { restKind: null, durationSec: 0 };
  if (source.exerciseId === target.exerciseId && source.setNumber === target.setNumber) {
    return { restKind: source.kind === "cluster" ? "cluster" : "drop_transition", durationSec: source.pauseAfterSec };
  }
  const group = plan.groups?.find(group => group.id === source.blockId);
  if (source.blockId !== target.blockId) return { restKind: "between_blocks", durationSec: group?.round_rest_sec ?? source.exerciseRestSec };
  if (group) return source.round === target.round
    ? { restKind: "group_transition", durationSec: group.transition_sec }
    : { restKind: "round", durationSec: group.round_rest_sec };
  return { restKind: "between_sets", durationSec: source.exerciseRestSec };
}

/** Decide before the caller commits facts/cursor/rest together. No network or clock reads here. */
export function resolveExecutionTransition(input: TransitionInput): TransitionDecision {
  const steps = buildExecutionSteps(input.plan);
  const processed = input.processedActionIds ?? [];
  const current = steps.find(step => step.id === input.cursor) ?? null;
  const base: TransitionDecision = {
    accepted: false, blockedReason: null, facts: input.facts, cursor: input.cursor, rest: input.rest,
    processedActionIds: processed, lastAction: input.lastAction ?? null, nextStep: current,
    restKind: input.rest?.restKind ?? null, durationSec: input.rest?.durationSec ?? 0, terminal: current === null, manualContinue: input.manualContinue ?? input.rest?.requiresConfirmation ?? false,
  };
  if (!["complete", "skip", "skip_participant", "correct", "undo"].includes(input.action)) return { ...base, blockedReason: "invalid_action" };
  if (processed.includes(input.actionId)) return { ...base, blockedReason: "duplicate" };
  if (!input.actionId || processed.length >= 16_000) return { ...base, blockedReason: "history_limit" };
  const source = steps.find(step => step.id === input.stepId);
  if (!source) return { ...base, blockedReason: "stale_step" };
  const accepted = { accepted: true, processedActionIds: [...processed, input.actionId] };
  if (input.action === "correct") return { ...base, ...accepted, lastAction: null };
  if (input.action === "undo") {
    const last = input.lastAction;
    if (!last || last.stepId !== source.id || last.actionId !== input.undoActionId) return { ...base, blockedReason: "undo_unavailable" };
    const rest = input.rest?.sourceActionId === last.actionId ? null : input.rest;
    return { ...base, ...accepted, facts: { ...input.facts, ...last.previousFacts }, cursor: source.id,
      nextStep: source, terminal: false, manualContinue: true, rest, restKind: rest?.restKind ?? null, durationSec: rest?.durationSec ?? 0, lastAction: null };
  }
  if (source.id !== input.cursor || (input.facts[source.id] ?? "pending") !== "pending") return { ...base, blockedReason: "stale_step" };
  if (input.rest && (executionRestNeedsConfirmation(input.rest, input.confirmedAt) || remainingRestMs(input.rest, input.confirmedAt) > 0)) return { ...base, blockedReason: "active_rest" };
  const skipping = input.action === "skip" || input.action === "skip_participant";
  const changedSteps = input.action === "skip_participant"
    ? steps.filter(step => step.exerciseId === source.exerciseId && step.setNumber === source.setNumber && (input.facts[step.id] ?? "pending") === "pending")
    : [source];
  const previousFacts = Object.fromEntries(changedSteps.map(step => [step.id, input.facts[step.id] ?? "pending"]));
  const facts = { ...input.facts, ...Object.fromEntries(changedSteps.map(step => [step.id, skipping ? "skipped" as const : "completed" as const])) };
  const nextStep = steps.find(step => (facts[step.id] ?? "pending") === "pending") ?? null;
  const pause = skipping ? { restKind: null, durationSec: 0 } : pauseFor(input.plan, source, nextStep);
  const rest = nextStep && pause.restKind ? createExecutionRest({
    owner: input.owner, clientWorkoutId: input.clientWorkoutId, sourceActionId: input.actionId,
    targetStep: nextStep, restKind: pause.restKind, durationSec: pause.durationSec, confirmedAt: input.confirmedAt,
  }) : null;
  return { ...base, ...accepted, facts, nextStep, cursor: nextStep?.id ?? null, rest, ...pause,
    terminal: nextStep === null, manualContinue: skipping, lastAction: { actionId: input.actionId, stepId: source.id, previousFacts } };
}


/** Preview consumes exactly the same pause rule as confirmed runtime actions. */
export function buildExecutionTimingPreview(plan: WorkoutPlan): Array<{ step: ExecutionStep; nextStep: ExecutionStep | null; restKind: RestKind | null; durationSec: number }> {
  const steps = buildExecutionSteps(plan);
  return steps.map((step, index) => ({ step, nextStep: steps[index + 1] ?? null, ...pauseFor(plan, step, steps[index + 1] ?? null) }));
}
