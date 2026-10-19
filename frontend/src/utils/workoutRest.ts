/** Deadlines are durable; intervals only repaint. One action can create at most one pause. */
import type { ExecutionStep } from "./workoutExecution";

export type RestKind = "cluster" | "drop_transition" | "group_transition" | "round" | "between_sets" | "between_blocks";
export type ClockSnapshot = { wallMs: number; monotonicMs: number; processId: string };
export type RestState = {
  version: 1;
  transitionId: string;
  sourceActionId: string;
  owner: string;
  clientWorkoutId: string;
  targetStep: ExecutionStep;
  restKind: RestKind;
  startedAt: number;
  endsAt: number;
  durationSec: number;
  anchor: ClockSnapshot & { remainingMs: number };
  requiresConfirmation: boolean;
  completionNotified: boolean;
};
type RestInput = Pick<RestState, "owner" | "clientWorkoutId" | "sourceActionId" | "targetStep" | "restKind" | "durationSec"> & { confirmedAt: ClockSnapshot };
const restKinds: RestKind[] = ["cluster", "drop_transition", "group_transition", "round", "between_sets", "between_blocks"];
const finiteTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 8.64e15;
const boundedId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
function validClock(value: unknown): value is ClockSnapshot {
  if (!value || typeof value !== "object") return false;
  const clock = value as ClockSnapshot;
  return finiteTime(clock.wallMs) && finiteTime(clock.monotonicMs) && clock.monotonicMs >= 0 && boundedId(clock.processId);
}
function validStep(value: unknown): value is ExecutionStep {
  if (!value || typeof value !== "object") return false;
  const step = value as ExecutionStep;
  return boundedId(step.id) && boundedId(step.exerciseId) && boundedId(step.blockId) && Number.isInteger(step.setNumber) && step.setNumber >= 1 && step.setNumber <= 20 &&
    Number.isInteger(step.round) && step.round >= 1 && step.round <= 20 && ["standard", "drop", "cluster"].includes(step.kind) &&
    Number.isInteger(step.exerciseRestSec) && step.exerciseRestSec >= 0 && step.exerciseRestSec <= 600 &&
    Number.isInteger(step.pauseAfterSec) && step.pauseAfterSec >= 0 && step.pauseAfterSec <= 600 &&
    (step.kind === "standard" ? step.partId === null && step.partOrdinal === null
      : boundedId(step.partId) && Number.isInteger(step.partOrdinal) && step.partOrdinal! >= 1 && step.partOrdinal! <= 8);
}
function validRest(value: unknown): value is RestState {
  if (!value || typeof value !== "object") return false;
  const rest = value as RestState;
  return rest.version === 1 && boundedId(rest.transitionId) && boundedId(rest.sourceActionId) && boundedId(rest.owner) && boundedId(rest.clientWorkoutId) && validStep(rest.targetStep) &&
    restKinds.includes(rest.restKind) && finiteTime(rest.startedAt) && finiteTime(rest.endsAt) &&
    Number.isInteger(rest.durationSec) && rest.durationSec >= 0 && rest.durationSec <= 600 && validClock(rest.anchor) &&
    finiteTime(rest.anchor.remainingMs) && rest.anchor.remainingMs >= 0 && rest.anchor.remainingMs <= rest.durationSec * 1000 &&
    typeof rest.requiresConfirmation === "boolean" && typeof rest.completionNotified === "boolean";
}

export function createExecutionRest(input: RestInput): RestState | null {
  if (!Number.isInteger(input.durationSec) || input.durationSec < 0 || input.durationSec > 600 || !validClock(input.confirmedAt)) throw new Error("Проверьте время отдыха");
  if (input.durationSec === 0) return null;
  const rest: RestState = { version: 1, transitionId: `${input.sourceActionId}:rest`, sourceActionId: input.sourceActionId,
    owner: input.owner, clientWorkoutId: input.clientWorkoutId, targetStep: input.targetStep, restKind: input.restKind,
    startedAt: input.confirmedAt.wallMs, endsAt: input.confirmedAt.wallMs + input.durationSec * 1000, durationSec: input.durationSec,
    anchor: { ...input.confirmedAt, remainingMs: input.durationSec * 1000 }, requiresConfirmation: false, completionNotified: false };
  if (!validRest(rest)) throw new Error("Не удалось проверить паузу тренировки");
  return rest;
}

function readClock(rest: RestState, now: ClockSnapshot): { remainingMs: number; uncertain: boolean } {
  if (rest.requiresConfirmation || !validClock(now)) return { remainingMs: 0, uncertain: true };
  if (rest.anchor.processId === now.processId) {
    const elapsed = now.monotonicMs - rest.anchor.monotonicMs;
    if (elapsed < 0) return { remainingMs: 0, uncertain: true };
    // Some hosts pause the monotonic counter during system sleep. A large
    // forward discrepancy is indistinguishable from changing system time.
    if (now.wallMs - rest.anchor.wallMs - elapsed > 5000) return { remainingMs: 0, uncertain: true };
    return { remainingMs: Math.max(0, rest.anchor.remainingMs - elapsed), uncertain: false };
  }
  if (now.wallMs < rest.anchor.wallMs - 1000) return { remainingMs: 0, uncertain: true };
  return { remainingMs: Math.max(0, Math.min(rest.durationSec * 1000, rest.endsAt - now.wallMs)), uncertain: false };
}
export function executionRestNeedsConfirmation(rest: RestState, now: ClockSnapshot): boolean { return readClock(rest, now).uncertain; }
export function remainingRestMs(rest: RestState, now: ClockSnapshot): number { return readClock(rest, now).remainingMs; }

export function restoreExecutionRest(raw: unknown, scope: { owner: string; clientWorkoutId: string }, now: ClockSnapshot): RestState | null {
  if (!validRest(raw) || raw.owner !== scope.owner || raw.clientWorkoutId !== scope.clientWorkoutId || !validClock(now)) return null;
  const clock = readClock(raw, now);
  return { ...raw, anchor: { ...now, remainingMs: clock.remainingMs }, requiresConfirmation: clock.uncertain };
}

/** Persist the returned record before playing sound/vibration, so reload cannot replay it. */
export function claimRestCompletion(rest: RestState, now: ClockSnapshot): { rest: RestState; shouldNotify: boolean } {
  const clock = readClock(rest, now);
  if (clock.uncertain || clock.remainingMs > 0 || rest.completionNotified) return { rest, shouldNotify: false };
  return { rest: { ...rest, completionNotified: true }, shouldNotify: true };
}
export function finishExecutionRest(rest: RestState, now: ClockSnapshot): RestState {
  return { ...rest, endsAt: now.wallMs, anchor: { ...now, remainingMs: 0 }, requiresConfirmation: false, completionNotified: true };
}
export function adjustExecutionRest(rest: RestState, deltaSeconds: number, now: ClockSnapshot): RestState {
  const clock = readClock(rest, now);
  if (!Number.isFinite(deltaSeconds) || clock.uncertain || clock.remainingMs <= 0) return rest;
  const delta = Math.round(deltaSeconds);
  const durationSec = Math.max(0, Math.min(600, rest.durationSec + delta));
  const remainingMs = Math.max(0, Math.min(durationSec * 1000, clock.remainingMs + delta * 1000));
  return { ...rest, durationSec, endsAt: now.wallMs + remainingMs, anchor: { ...now, remainingMs }, completionNotified: remainingMs === 0 || rest.completionNotified };
}


let processId: string | null = null;
export function workoutClockSnapshot(): ClockSnapshot {
  processId ??= crypto.randomUUID();
  return { wallMs: Date.now(), monotonicMs: performance.now(), processId };
}
