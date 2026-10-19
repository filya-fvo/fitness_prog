import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initializeExecutionSession, commitExecutionAction, claimExecutionSignal, changeExecutionRest, finishExecutionSession, showExecutionStep,
  type ExecutionValues } from "@/db/workoutExecution";
import { flushSyncQueue } from "@/db/syncQueue";
import type { LocalWorkoutSession } from "@/db/schema";
import { useWorkoutStore } from "@/store/workoutStore";
import { useUserStore } from "@/store/userStore";
import { buildExecutionSteps, type TransitionInput } from "@/utils/workoutExecution";
import { remainingRestMs, executionRestNeedsConfirmation, workoutClockSnapshot } from "@/utils/workoutRest";
import type { WorkoutPlan } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";
import { hapticNotification } from "@/lib/telegram";
import { useTimerNotificationDelivery } from "./useTimerNotificationDelivery";

export function useWorkoutExecution(enabled: boolean, autoAdvance: boolean) {
  const owner = useUserStore(state => state.user?.id);
  const client = useWorkoutStore(state => state.clientWorkoutId);
  const workoutId = useWorkoutStore(state => state.activeWorkout?.id);
  const plan = useWorkoutStore(state => state.activeWorkout?.plan) as WorkoutPlan | undefined;
  const execution = useWorkoutStore(state => state.execution);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(workoutClockSnapshot);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const claiming = useRef(false);
  const editing = useRef(false);
  const preference = useRef(autoAdvance);
  preference.current = autoAdvance;
  const delivery = useTimerNotificationDelivery(() => "Отдых завершён. Продолжите следующий шаг", enabled ? workoutId : null);
  const notify = useRef(delivery.finish);
  notify.current = delivery.finish;

  const apply = useCallback((session: LocalWorkoutSession, current: number) => {
    if (current !== generation.current || useUserStore.getState().user?.id !== owner || session.clientId !== client) return false;
    return useWorkoutStore.getState().applyExecutionSession(session, workoutClockSnapshot());
  }, [owner, client]);
  const sync = useCallback(() => {
    const current = generation.current;
    if (owner) void flushSyncQueue(owner).catch(() => {
      if (current === generation.current) setError("Результат сохранён на устройстве. Синхронизация повторится при восстановлении связи");
    });
  }, [owner]);
  const reload = useCallback(async () => {
    const current = generation.current;
    const state = useWorkoutStore.getState();
    if (!enabled || !owner || !client || !state.activeWorkout || state.activeWorkout.user_id !== owner) return;
    try {
      const session = await initializeExecutionSession({ owner, clientWorkoutId: client, serverWorkoutId: state.serverWorkoutId,
        workout: state.activeWorkout, drafts: state.drafts, now: workoutClockSnapshot() });
      if (apply(session, current)) { setReady(true); setClock(workoutClockSnapshot()); }
    } catch (err) { if (current === generation.current) setError(toUserMessage(err, "Не удалось восстановить выполнение")); }
  }, [apply, client, enabled, owner]);
  useEffect(() => {
    generation.current += 1; busyRef.current = false; claiming.current = false; editing.current = false; setBusy(false); setReady(false); setError(null);
    if (enabled) void reload();
    return () => { generation.current += 1; };
  }, [enabled, owner, client, workoutId, reload]);

  useEffect(() => {
    if (!enabled || !ready || !owner || !client) return;
    const update = () => {
      const now = workoutClockSnapshot();
      setClock(now);
      const store = useWorkoutStore.getState();
      store.projectExecutionTime(now);
      const rest = store.execution?.progress.rest;
      if (!rest || rest.completionNotified || executionRestNeedsConfirmation(rest, now) || remainingRestMs(rest, now) > 0 || claiming.current) return;
      claiming.current = true;
      const current = generation.current;
      void claimExecutionSignal(owner, client, now, preference.current && !editing.current).then(result => {
        if (result.claimed && apply(result.session, current)) {
          hapticNotification("success");
          window.dispatchEvent(new CustomEvent("fitness:execution-rest-ended", { detail: { transitionId: rest.transitionId } }));
          void notify.current(rest.endsAt, "Отдых завершён. Продолжите следующий шаг").catch(() => { if (current === generation.current) setError("Не удалось доставить уведомление об отдыхе"); });
        }
      }).catch(err => { if (current === generation.current) setError(toUserMessage(err, "Не удалось сохранить окончание отдыха")); })
        .finally(() => { if (current === generation.current) claiming.current = false; });
    };
    const resume = () => { if (document.visibilityState !== "hidden") void reload(); };
    update();
    const timer = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume); window.removeEventListener("focus", resume); };
  }, [apply, client, enabled, owner, ready, reload]);

  const act = useCallback(async (action: TransitionInput["action"], stepId: string, values?: ExecutionValues, undoActionId?: string) => {
    if (!enabled || !owner || !client || busyRef.current) return false;
    const state = useWorkoutStore.getState();
    if (!state.execution) return false;
    const confirmedAt = workoutClockSnapshot();
    const actionId = crypto.randomUUID();
    const current = generation.current;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await commitExecutionAction({ owner, clientWorkoutId: client, actionId, stepId, action, confirmedAt,
        values, undoActionId, expectedRevision: state.execution.revision, autoAdvance: preference.current });
      if (!apply(result.session, current)) return false;
      if (result.accepted) { editing.current = false; sync(); }
      return result.accepted;
    } catch (err) {
      if (current === generation.current) { setError(toUserMessage(err, "Не удалось сохранить результат. Повторите действие")); void reload(); }
      return false;
    } finally { if (current === generation.current) { busyRef.current = false; setBusy(false); } }
  }, [apply, client, enabled, owner, reload, sync]);
  const restAction = useCallback(async (deltaSeconds?: number) => {
    if (!owner || !client || busyRef.current) return;
    const rest = useWorkoutStore.getState().execution?.progress.rest;
    if (!rest) return;
    const current = generation.current;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const session = await changeExecutionRest({ owner, clientWorkoutId: client, actionId: crypto.randomUUID(), transitionId: rest.transitionId,
        now: workoutClockSnapshot(), deltaSeconds, autoAdvance: preference.current && !editing.current });
      apply(session, current);
    } catch (err) { if (current === generation.current) setError(toUserMessage(err, "Не удалось изменить отдых")); }
    finally { if (current === generation.current) { busyRef.current = false; setBusy(false); } }
  }, [apply, client, owner]);
  const show = useCallback(async (stepId: string) => {
    if (!owner || !client || busyRef.current) return;
    const current = generation.current;
    try { apply(await showExecutionStep(owner, client, stepId), current); editing.current = false; }
    catch (err) { if (current === generation.current) setError(toUserMessage(err, "Не удалось открыть шаг")); }
  }, [apply, owner, client]);
  const finish = useCallback(async (rpe: number, aiNotes: string | null) => {
    if (!owner || !client) throw new Error("Откройте тренировку заново");
    const current = generation.current;
    const session = await finishExecutionSession({ owner, clientWorkoutId: client, actionId: crypto.randomUUID(), now: workoutClockSnapshot(), rpe, aiNotes });
    apply(session, current); sync(); return session.workout;
  }, [apply, owner, client, sync]);
  const steps = useMemo(() => enabled && plan?.exercises.length ? buildExecutionSteps(plan) : [], [enabled, plan]);
  const viewed = steps.find(step => step.id === execution?.viewStepId) ?? steps.find(step => step.id === execution?.progress.cursor) ?? null;
  const next = steps.find(step => step.id === execution?.progress.cursor) ?? null;
  return { ready, busy, error, clock, execution, steps, viewed, next, act, restAction, show, finish,
    markEditing: (value: boolean) => { editing.current = value; }, reload };
}
export type WorkoutExecutionController = ReturnType<typeof useWorkoutExecution>;
