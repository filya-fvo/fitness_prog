/** One start path for Home, Training and Programs; durable writes precede navigation. */
import { fetchPlannedWorkoutPlan } from "@/api/workouts";
import { confirmAction } from "@/lib/telegram";
import { startProgramWorkout } from "@/api/programs";
import { getStoredToken } from "@/api/client";
import { db, type LocalWorkoutSession } from "@/db/schema";
import { readOfflineWorkoutContext } from "@/db/offlineWorkoutContext";
import { findWorkoutPreparation } from "@/db/workoutCustomization";
import { loadExerciseHints } from "@/db/workoutLoadHints";
import { useUserStore } from "@/store/userStore";
import type { Workout, WorkoutPlan } from "@/types/workout";
import { draftsFromWorkoutSnapshot } from "@/utils/workoutSession";
import { ensureExecutionDrafts } from "@/utils/workoutExecutionState";
import { draftsWithSuggestions, localDateKey } from "@/utils/loadProgression";
import { phaseMetaFromName, readProgramCursor } from "@/utils/programProgress";
import { isOnline } from "@/utils/network";

type Input = Parameters<typeof startProgramWorkout>[0] & { warmupLocation?: string; ownerUserId?: string };
const starts = new Map<string, Promise<LocalWorkoutSession>>();
async function confirmIntensity(owner: string, plan: WorkoutPlan, readiness: Input["cycleReadiness"]): Promise<void> {
  if (!readiness || readiness === "normal" || (!plan.groups?.length && !plan.customization_scopes?.length && !plan.exercises.some(row => row.set_methods?.length))) return;
  const accepted = await confirmAction("Вы выбрали снижение нагрузки. Явно заданные методы, веса и повторы не облегчаются автоматически. При необходимости измените их в подготовке. Начать с этими настройками?");
  checkOwner(owner);
  if (!accepted) throw new Error("Старт отменён. Проверьте личные настройки в подготовке тренировки");
}
function checkOwner(owner: string): void { if (useUserStore.getState().user?.id !== owner) throw new Error("Аккаунт изменился. Откройте тренировку снова"); }
export function startProgramSession(input: Input): Promise<LocalWorkoutSession> {
  const owner = useUserStore.getState().user?.id;
  if (input.ownerUserId && input.ownerUserId !== owner) return Promise.reject(new Error("Аккаунт изменился. Откройте тренировку снова"));
  if (!owner) return Promise.reject(new Error("Войдите в аккаунт"));
  const day = input.scheduledDate ?? localDateKey();
  const key = `${owner}:${input.programId}:${day}`;
  const running = starts.get(key);
  if (running) return running;
  const task = start(owner, day, input).finally(() => starts.delete(key));
  starts.set(key, task);
  return task;
}
async function existingSession(owner: string, program: string, day: string): Promise<LocalWorkoutSession | null> {
  const workouts = await db.workouts.where("user_id").equals(owner).filter(row => row.program_id === program && row.scheduled_date === day).toArray();
  checkOwner(owner);
  if (workouts.some(row => row.status === "completed")) throw new Error("Тренировка этой программы на эту дату уже завершена");
  return (await db.sessions.where("ownerUserId").equals(owner).filter(row => row.workout.program_id === program && row.workout.scheduled_date === day && row.workout.status === "planned").first()) ?? null;
}
async function start(owner: string, day: string, input: Input): Promise<LocalWorkoutSession> {
  const existing = await existingSession(owner, input.programId, day);
  checkOwner(owner);
  if (existing) return existing;
  const clientId: string = crypto.randomUUID();
  let serverId: string | null = null;
  const context = { programId: input.programId, dayIndex: input.dayIndex ?? 1, scheduledDate: day, weekPhase: input.weekPhase };
  const proposal = await findWorkoutPreparation(context);
  checkOwner(owner);
  let workout: Workout;
  let queued: Record<string, unknown> | null = null;
  if (isOnline() && getStoredToken() && (!proposal || proposal.receipt)) {
    if (input.cycleReadiness && input.cycleReadiness !== "normal") {
      const preview = await fetchPlannedWorkoutPlan({ ...context, cycleReadiness: input.cycleReadiness });
      checkOwner(owner);
      await confirmIntensity(owner, preview, input.cycleReadiness);
    }
    workout = await startProgramWorkout(input);
    checkOwner(owner);
    if (workout.user_id !== owner) throw new Error("Не удалось проверить владельца тренировки");
    serverId = workout.id;
  } else {
    const bundle = await readOfflineWorkoutContext(owner, localDateKey()) ?? await readOfflineWorkoutContext(owner, day);
    checkOwner(owner);
    if (!bundle?.program || bundle.program.id !== input.programId) throw new Error("Откройте программу с интернетом, чтобы подготовить её без сети");
    const phase = input.weekPhase ?? readProgramCursor(bundle.profile.goals, bundle.program).weekPhase;
    const readiness = input.cycleReadiness ?? "normal";
    const prepared = bundle.plans.find(row => row.scheduled_date === day && row.day_index === context.dayIndex && row.week_phase === phase && row.readiness === readiness);
    if (!prepared?.preparation_fingerprint || !prepared.plan.exercises.length) throw new Error("Этот вариант нагрузки не подготовлен. Откройте программу с интернетом");
    let plan = prepared.plan as WorkoutPlan;
    let dependency: string | null = null;
    if (proposal && !proposal.receipt) {
      if (proposal.context.scheduledDate !== day || proposal.context.weekPhase !== phase || readiness !== "normal") throw new Error("Отправьте подготовку перед выбором другой даты или нагрузки");
      const originalIds = new Set(proposal.loaded.exercises.map(row => row.exercise_id));
      plan = { ...proposal.edited, exercises: proposal.edited.exercises.map(row => {
        if (originalIds.has(row.exercise_id) || (row.original_exercise_id && originalIds.has(row.original_exercise_id))) return row;
        if ((row.target_reps == null || row.rest_sec == null) && !prepared.exercise_defaults) throw new Error("Обновите подготовку с интернетом, чтобы узнать повторы и отдых нового упражнения");
        return { ...row, target_reps: row.target_reps ?? prepared.exercise_defaults!.target_reps, rest_sec: row.rest_sec ?? prepared.exercise_defaults!.rest_sec };
      }) } as WorkoutPlan;
      dependency = `workout-preparation:v1:${owner}:op:${proposal.operationId}`;
    }
    await confirmIntensity(owner, plan, readiness);
    const confirmedAt = new Date().toISOString();
    workout = { id: clientId, user_id: owner, program_id: input.programId, scheduled_date: day, status: "planned", title: plan.title ?? null, workout_type: plan.workout_type ?? null, plan, sets: [], started_at: confirmedAt, completed_at: null, ai_notes: null, rpe: null };
    queued = { scheduledDate: day, programId: input.programId, dayIndex: context.dayIndex, weekPhase: phase, cycleReadiness: readiness,
      executionVersion: 2, plan, preparationDraftKey: dependency,
      preparation: { prepared_at: bundle.preparedAt, schedule_fingerprint: bundle.scheduleFingerprint, plan_fingerprint: prepared.preparation_fingerprint } };
  }
  const rawPlan = workout.plan as WorkoutPlan;
  const history = await loadExerciseHints(rawPlan.exercises.map(row => row.exercise_id));
  checkOwner(owner);
  const phase = rawPlan.week_phase === "light" || rawPlan.week_phase === "heavy" ? rawPlan.week_phase : "medium";
  const suggestions = draftsWithSuggestions({ exercises: rawPlan.exercises, history, phase: phaseMetaFromName(phase) });
  let drafts = draftsFromWorkoutSnapshot(workout).map(draft => {
    if (draft.isCompleted || draft.isSkipped || draft.parts?.some(part => part.status !== "pending")) return draft;
    const suggestion = suggestions.find(row => row.exerciseId === draft.exerciseId && row.setNumber === draft.setNumber);
    return { ...draft, reps: draft.reps || suggestion?.reps || "", weight: draft.weight || suggestion?.weight || "", weightMode: draft.weightMode ?? suggestion?.weightMode,
      durationSec: draft.durationSec ?? suggestion?.durationSec, machineParams: draft.machineParams ?? suggestion?.machineParams };
  });
  if (rawPlan.execution_version === 2) drafts = ensureExecutionDrafts(workout, drafts, () => crypto.randomUUID());
  if (input.warmupLocation !== undefined) workout = { ...workout, plan: { ...rawPlan, warmup_pending: true, warmup_location: input.warmupLocation } };
  return db.transaction("rw", db.sessions, db.workouts, db.workoutIdMap, db.syncQueue, async () => {
    checkOwner(owner);
    const other = await existingSession(owner, input.programId, day);
    if (other) return other;
    const session: LocalWorkoutSession = { clientId, ownerUserId: owner, serverId, workout, drafts, currentExerciseIndex: 0, updatedAt: Date.now() };
    await db.sessions.add(session);
    await db.workouts.put(workout);
    if (serverId) await db.workoutIdMap.put({ clientId, ownerUserId: owner, serverId, updatedAt: Date.now() });
    if (queued) {
      // A clock adjustment cannot place this create before its personal proposal.
      const dependency = proposal ? await db.syncQueue.get(proposal.operationId) : null;
      await db.syncQueue.add({ id: crypto.randomUUID(), ownerUserId: owner, clientWorkoutId: clientId, type: "create_workout", payload: queued,
        createdAt: Math.max(Date.now(), (dependency?.createdAt ?? 0) + 1), attempts: 0, lastError: null });
    }
    checkOwner(owner);
    return session;
  });
}
