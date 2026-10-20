/** Atomic facts/cursor/rest/outbox writes. No network is allowed inside these transactions. */
import { db, type LocalWorkoutSession, type SyncQueueItem } from "./schema";
import { useUserStore } from "@/store/userStore";
import type { LocalSetDraft, Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";
import { MAX_EXECUTION_ACTIONS, buildExecutionSteps, executionStepId, resolveExecutionTransition, type ExecutionProgress, type TransitionInput } from "@/utils/workoutExecution";
import { executionFactsFromDrafts } from "@/utils/workoutSession";
import { ensureExecutionDrafts, executionSnapshotKey, assertExecutionSessionSnapshot } from "@/utils/workoutExecutionState";
import { remainingRestMs, adjustExecutionRest, claimRestCompletion, finishExecutionRest, restoreExecutionRest, type ClockSnapshot, workoutClockSnapshot } from "@/utils/workoutRest";

export type ExecutionValues = { baseSetRevision?: number; reps: string; weight: string; weightMode?: "total" | "per_hand" | null;
  durationSec: number | null; note?: string | null; machineParams?: Record<string, string | number> | null };
export type ExecutionAction = Pick<TransitionInput, "owner" | "clientWorkoutId" | "action" | "actionId" | "stepId" | "confirmedAt" | "undoActionId"> & {
  expectedRevision: number; values?: ExecutionValues; autoAdvance: boolean;
};
export type ExecutionCommit = { session: LocalWorkoutSession; accepted: boolean };

function requireOwner(owner: string): void {
  if (useUserStore.getState().user?.id !== owner) throw new Error("Аккаунт изменился. Откройте тренировку заново");
}
function assertSession(session: LocalWorkoutSession | undefined, owner: string): asserts session is LocalWorkoutSession {
  requireOwner(owner);
  if (!session || session.ownerUserId !== owner || session.workout.user_id !== owner || !session.execution || session.execution.owner !== owner || session.execution.clientWorkoutId !== session.clientId)
    throw new Error("Не удалось проверить сохранённую тренировку");
  assertExecutionSessionSnapshot(session, owner, workoutClockSnapshot());
}
function progressOf(decision: ExecutionProgress): ExecutionProgress {
  return { facts: decision.facts, cursor: decision.cursor, rest: decision.rest, manualContinue: decision.manualContinue,
    processedActionIds: decision.processedActionIds, lastAction: decision.lastAction };
}
function jumpToCursor(session: LocalWorkoutSession, autoAdvance: boolean): void {
  if (!autoAdvance || session.execution!.progress.manualContinue) return;
  const target = buildExecutionSteps(session.workout.plan as WorkoutPlan).find(step => step.id === session.execution!.progress.cursor);
  if (target) {
    session.execution!.viewStepId = target.id;
    session.currentExerciseIndex = [...(session.workout.plan as WorkoutPlan).exercises].sort((a, b) => a.order - b.order).findIndex(row => row.exercise_id === target.exerciseId);
  }
}
function queueTime(session: LocalWorkoutSession): number {
  const value = Math.max(Date.now(), session.execution!.lastQueuedAt + 1);
  session.execution!.lastQueuedAt = value;
  return value;
}
async function writeSession(session: LocalWorkoutSession): Promise<void> {
  session.updatedAt = Date.now();
  await db.sessions.put(session);
  await db.workouts.put(session.workout);
  requireOwner(session.ownerUserId);
}

export async function initializeExecutionSession(input: { owner: string; clientWorkoutId: string; serverWorkoutId: string | null;
  workout: Workout; drafts: LocalSetDraft[]; now: ClockSnapshot }): Promise<LocalWorkoutSession> {
  requireOwner(input.owner);
  return db.transaction("rw", db.sessions, db.workouts, db.syncQueue, async () => {
    let session = await db.sessions.get(input.clientWorkoutId);
    if (!session) session = { clientId: input.clientWorkoutId, ownerUserId: input.owner, serverId: input.serverWorkoutId,
      workout: input.workout, drafts: input.drafts, currentExerciseIndex: 0, updatedAt: Date.now() };
    if (session.ownerUserId !== input.owner || session.workout.user_id !== input.owner) throw new Error("Тренировка принадлежит другому аккаунту");
    const plan = session.workout.plan as WorkoutPlan;
    if (plan.execution_version !== 2) throw new Error("Не удалось проверить формат тренировки");
    if (!session.execution) {
      session.drafts = ensureExecutionDrafts(session.workout, session.drafts, () => crypto.randomUUID());
      const facts = executionFactsFromDrafts(plan, session.drafts);
      const queue = await db.syncQueue.where("ownerUserId").equals(input.owner).filter(item => item.clientWorkoutId === input.clientWorkoutId).toArray();
      session.execution = { version: 1, owner: input.owner, clientWorkoutId: input.clientWorkoutId, snapshotKey: executionSnapshotKey(plan),
        revision: 0, viewStepId: buildExecutionSteps(plan).find(step => facts[step.id] === "pending")?.id ?? buildExecutionSteps(plan).at(-1)?.id ?? null, lastQueuedAt: Math.max(0, ...queue.map(item => item.createdAt)), progress: {
          facts, cursor: buildExecutionSteps(plan).find(step => facts[step.id] === "pending")?.id ?? null,
          rest: null, processedActionIds: [], lastAction: null, manualContinue: false,
        } };
    }
    assertSession(session, input.owner);
    if (session.execution!.progress.rest) {
      session.execution!.progress.rest = restoreExecutionRest(session.execution!.progress.rest, { owner: input.owner, clientWorkoutId: input.clientWorkoutId }, input.now);
      session.execution!.revision += 1;
    }
    await writeSession(session);
    return session;
  });
}

function numberValue(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Проверьте повторы и вес");
  return number;
}
function validateResult(draft: LocalSetDraft): void {
  if ((draft.note?.length ?? 0) > 1000) throw new Error("Сократите заметку до 1000 символов");
  if (draft.durationSec != null && (!Number.isInteger(draft.durationSec) || draft.durationSec < 0 || draft.durationSec > 86400)) throw new Error("Укажите время работы от 0 до 86400 секунд");
  const parts = draft.parts ?? [];
  if (draft.executionKind === "standard") {
    const reps = numberValue(draft.reps);
    const weight = numberValue(draft.weight);
    if (reps !== null && (!Number.isInteger(reps) || reps < 0 || reps > 100000)) throw new Error("Проверьте число повторов");
    if (weight !== null && (weight < 0 || weight > 10000)) throw new Error("Проверьте рабочий вес");
    if (draft.isCompleted && !((reps ?? 0) > 0 || (draft.durationSec ?? 0) > 0)) throw new Error("Укажите повторы или время работы");
    return;
  }
  for (const part of parts) {
    if (part.reps !== null && (!Number.isInteger(part.reps) || part.reps < 0 || part.reps > 100000)) throw new Error("Проверьте повторы части");
    if (part.weight !== null && (!Number.isFinite(part.weight) || part.weight <= 0 || part.weight > 10000 || Math.abs(part.weight * 100 - Math.round(part.weight * 100)) > 1e-7)) throw new Error("Укажите положительный вес с точностью до сотых");
    if (part.status === "completed" && (!(part.reps && part.reps > 0) || !(part.weight && part.weight > 0))) throw new Error("Укажите повторы и вес выполненной части");
  }
  const weights = parts.flatMap(part => part.weight === null ? [] : [part.weight]);
  if (draft.executionKind === "cluster" && new Set(weights).size > 1) throw new Error("Вес выполненных частей кластера должен совпадать");
  if (draft.executionKind === "drop" && weights.some((weight, i) => i > 0 && weights[i - 1] <= weight)) throw new Error("В дроп-сете вес каждой следующей части должен снижаться");
}
function setFromDraft(session: LocalWorkoutSession, draft: LocalSetDraft): WorkoutSet {
  const previous = session.workout.sets.find(row => row.exercise_id === draft.exerciseId && row.set_number === draft.setNumber);
  return { id: previous?.id ?? crypto.randomUUID(), workout_id: session.workout.id, exercise_id: draft.exerciseId, set_number: draft.setNumber,
    execution_kind: draft.executionKind ?? "standard", execution_revision: draft.executionRevision ?? 0, parts: draft.parts ?? [],
    reps: draft.executionKind === "standard" ? numberValue(draft.reps) : null, weight: draft.executionKind === "standard" ? numberValue(draft.weight) : null,
    weight_mode: draft.weightMode ?? null, is_skipped: draft.isSkipped ?? false, is_completed: draft.isCompleted, rest_time_sec: draft.restTimeSec,
    duration_sec: draft.durationSec ?? null, note: draft.note ?? null, machine_params: draft.machineParams ?? null };
}

export async function commitExecutionAction(input: ExecutionAction): Promise<ExecutionCommit> {
  requireOwner(input.owner);
  return db.transaction("rw", db.sessions, db.workouts, db.syncQueue, async () => {
    const session = await db.sessions.get(input.clientWorkoutId);
    assertSession(session, input.owner);
    const execution = session.execution!;
    if (execution.progress.processedActionIds.includes(input.actionId)) return { session, accepted: false };
    if (execution.revision !== input.expectedRevision) throw new Error("Тренировка изменилась в другой вкладке. Повторите действие после обновления");
    if (session.workout.status !== "planned") throw new Error("Тренировка уже завершена");
    const decision = resolveExecutionTransition({ ...input, ...execution.progress, plan: session.workout.plan as WorkoutPlan, rest: execution.progress.rest });
    if (!decision.accepted) {
      if (decision.blockedReason === "active_rest") throw new Error("Сначала закончите текущий отдых");
      if (decision.blockedReason === "undo_unavailable") throw new Error("Это действие уже нельзя отменить");
      throw new Error("Текущий шаг изменился. Проверьте порядок выполнения");
    }
    const step = buildExecutionSteps(session.workout.plan as WorkoutPlan).find(step => step.id === input.stepId)!;
    const draft = structuredClone(session.drafts.find(row => row.exerciseId === step.exerciseId && row.setNumber === step.setNumber)!);
    if (!draft) throw new Error("Подход не найден");
    if (input.values?.baseSetRevision !== undefined && input.values.baseSetRevision !== (draft.executionRevision ?? 0))
      throw new Error("Подход изменён в другой вкладке. Введённые значения остались в форме; обновите её перед сохранением");
    if (input.values && (input.action === "complete" || input.action === "correct")) {
      draft.weightMode = input.values.weightMode ?? draft.weightMode ?? null;
      if (input.values.note !== undefined) draft.note = input.values.note;
      if (input.values.machineParams !== undefined) draft.machineParams = input.values.machineParams;
      if (step.partOrdinal === null) Object.assign(draft, { reps: input.values.reps, weight: input.values.weight, durationSec: input.values.durationSec });
      else draft.parts = draft.parts!.map(part => part.ordinal === step.partOrdinal ? { ...part,
        reps: numberValue(input.values!.reps), weight: numberValue(input.values!.weight), duration_sec: input.values!.durationSec } : part);
    }
    if (step.partOrdinal === null) {
      draft.isCompleted = decision.facts[step.id] === "completed";
      draft.isSkipped = decision.facts[step.id] === "skipped";
    }
    else {
      draft.parts = draft.parts!.map(part => ({ ...part, status: decision.facts[executionStepId(step.exerciseId, step.setNumber, part.ordinal)] ?? "pending" }));
      draft.isCompleted = draft.parts.every(part => part.status !== "pending") && draft.parts.some(part => part.status === "completed");
      draft.reps = ""; draft.weight = "";
    }
    validateResult(draft);
    const baseRevision = draft.executionRevision ?? 0;
    draft.executionRevision = baseRevision + 1;
    session.drafts = session.drafts.map(row => row.exerciseId === draft.exerciseId && row.setNumber === draft.setNumber ? draft : row);
    const result = setFromDraft(session, draft);
    session.workout = { ...session.workout, sets: [...session.workout.sets.filter(row => row.exercise_id !== draft.exerciseId || row.set_number !== draft.setNumber), result] };
    execution.progress = progressOf(decision); execution.revision += 1;
    if (input.action === "undo") session.execution!.viewStepId = step.id;
    if (!decision.rest && !decision.manualContinue) jumpToCursor(session, input.autoAdvance);
    const queued: SyncQueueItem = { id: input.actionId, ownerUserId: input.owner, type: "add_set", clientWorkoutId: input.clientWorkoutId,
      createdAt: queueTime(session), attempts: 0, lastError: null, payload: {
        executionVersion: 2, executionKind: draft.executionKind, baseExecutionRevision: baseRevision, clientOperationId: input.actionId,
        exerciseId: draft.exerciseId, setNumber: draft.setNumber, reps: result.reps, weight: result.weight, weightMode: result.weight_mode,
        restTimeSec: result.rest_time_sec, durationSec: result.duration_sec, note: result.note, machineParams: result.machine_params,
        isCompleted: result.is_completed, isSkipped: result.is_skipped ?? false, parts: result.parts,
      } };
    await writeSession(session);
    await db.syncQueue.add(queued);
    requireOwner(input.owner);
    return { session, accepted: true };
  });
}

export async function claimExecutionSignal(owner: string, client: string, now: ClockSnapshot, autoAdvance: boolean): Promise<{ session: LocalWorkoutSession; claimed: boolean }> {
  requireOwner(owner);
  return db.transaction("rw", db.sessions, db.workouts, async () => {
    const session = await db.sessions.get(client);
    assertSession(session, owner);
    const progress = session.execution!.progress;
    if (!progress.rest) return { session, claimed: false };
    const result = claimRestCompletion(progress.rest, now);
    if (!result.shouldNotify) return { session, claimed: false };
    progress.rest = result.rest;
    session.execution!.revision += 1;
    jumpToCursor(session, autoAdvance);
    await writeSession(session);
    return { session, claimed: true };
  });
}

export async function changeExecutionRest(input: { owner: string; clientWorkoutId: string; transitionId: string; actionId: string;
  now: ClockSnapshot; deltaSeconds?: number; autoAdvance: boolean }): Promise<LocalWorkoutSession> {
  requireOwner(input.owner);
  return db.transaction("rw", db.sessions, db.workouts, async () => {
    const session = await db.sessions.get(input.clientWorkoutId);
    assertSession(session, input.owner);
    const execution = session.execution!;
    if (execution.progress.processedActionIds.includes(input.actionId)) return session;
    const rest = execution.progress.rest;
    if (!rest || rest.transitionId !== input.transitionId) throw new Error("Эта пауза уже закончилась");
    if (input.deltaSeconds === undefined && rest.completionNotified && !rest.requiresConfirmation && remainingRestMs(rest, input.now) === 0) return session;
    const next = input.deltaSeconds === undefined ? finishExecutionRest(rest, input.now) : adjustExecutionRest(rest, input.deltaSeconds, input.now);
    if (next === rest) return session;
    if (input.deltaSeconds !== undefined && execution.progress.processedActionIds.length >= MAX_EXECUTION_ACTIONS) throw new Error("Достигнут лимит действий. Можно закончить отдых или тренировку");
    execution.progress.rest = next;
    if (execution.progress.processedActionIds.length < MAX_EXECUTION_ACTIONS) execution.progress.processedActionIds = [...execution.progress.processedActionIds, input.actionId];
    execution.revision += 1;
    if (input.deltaSeconds === undefined) jumpToCursor(session, input.autoAdvance);
    await writeSession(session);
    return session;
  });
}

export async function finishExecutionSession(input: { owner: string; clientWorkoutId: string; actionId: string;
  now: ClockSnapshot; rpe: number; aiNotes: string | null }): Promise<LocalWorkoutSession> {
  requireOwner(input.owner);
  return db.transaction("rw", db.sessions, db.workouts, db.syncQueue, async () => {
    const session = await db.sessions.get(input.clientWorkoutId);
    assertSession(session, input.owner);
    if (session.workout.status === "completed") return session;
    const execution = session.execution!;
    const completedAt = new Date(input.now.wallMs).toISOString();
    const startedAt = Date.parse(session.workout.started_at ?? completedAt);
    session.workout = { ...session.workout, status: "completed", completed_at: completedAt, rpe: input.rpe,
      ai_notes: input.aiNotes, duration_sec: Math.max(0, Math.floor((input.now.wallMs - startedAt) / 1000)) };
    execution.progress.rest = null;
    if (execution.progress.processedActionIds.length < MAX_EXECUTION_ACTIONS) execution.progress.processedActionIds = [...execution.progress.processedActionIds, input.actionId];
    execution.revision += 1;
    const queued: SyncQueueItem = { id: input.actionId, ownerUserId: input.owner, clientWorkoutId: input.clientWorkoutId,
      type: "complete_workout", createdAt: queueTime(session), attempts: 0, lastError: null,
      payload: { executionVersion: 2, completedAt, durationSec: session.workout.duration_sec, rpe: input.rpe, aiNotes: input.aiNotes } };
    await writeSession(session);
    await db.syncQueue.add(queued);
    requireOwner(input.owner);
    return session;
  });
}


export async function showExecutionStep(owner: string, client: string, stepId: string): Promise<LocalWorkoutSession> {
  requireOwner(owner);
  return db.transaction("rw", db.sessions, db.workouts, async () => {
    const session = await db.sessions.get(client);
    assertSession(session, owner);
    const step = buildExecutionSteps(session.workout.plan as WorkoutPlan).find(step => step.id === stepId);
    if (!step) throw new Error("Шаг отсутствует в плане");
    session.execution!.viewStepId = step.id;
    session.execution!.revision += 1;
    session.currentExerciseIndex = [...(session.workout.plan as WorkoutPlan).exercises].sort((a, b) => a.order - b.order).findIndex(row => row.exercise_id === step.exerciseId);
    await writeSession(session);
    return session;
  });
}
