import { useEffect, useRef } from "react";
import { cancelTimerNotification, notifyTimerEnded, scheduleTimerNotification } from "@/api/notifications";
import { notificationPlatform, type NotificationPlatform } from "@/lib/notificationPlatform";
import { useWorkoutStore } from "@/store/workoutStore";
import { useUserStore } from "@/store/userStore";
import { isOnline } from "@/utils/network";

export type TimerDeliverySnapshot = {
  isResting: boolean; restEndsAtMs: number | null; restNotificationId: string | null;
  restOwner: string | null; restClientWorkoutId: string | null;
  serverWorkoutId: string | null; activeWorkoutId: string | null;
};
type Dependencies = {
  platform: NotificationPlatform; online: () => boolean; now: () => number; owner: () => string | null;
  schedule: typeof scheduleTimerNotification; cancel: typeof cancelTimerNotification;
  notify: typeof notifyTimerEnded;
};

export function createTimerNotificationDelivery(deps: Dependencies) {
  let sequence = 0;
  let queue = Promise.resolve();
  let nativeKey: string | null = null;
  let nativeEnd: number | null = null;
  let serverEnd: number | null = null;
  let serverId: string | undefined;
  const nativeMode = (status: Awaited<ReturnType<NotificationPlatform["status"]>>) =>
    status.available && (status.active || status.pending);

  function update(snapshot: TimerDeliverySnapshot, text: string): Promise<void> {
    const request = ++sequence;
    const run = async () => {
      const status = await deps.platform.status();
      if (request !== sequence || (snapshot.restOwner && snapshot.restOwner !== deps.owner())) return;
      if (nativeMode(status)) {
        if (snapshot.isResting && snapshot.restEndsAtMs && snapshot.restNotificationId && snapshot.restOwner
          && snapshot.restOwner === status.owner && snapshot.restClientWorkoutId) {
          const key = `${snapshot.restOwner}:${snapshot.restClientWorkoutId}:${snapshot.restNotificationId}:${snapshot.restEndsAtMs}`;
          if (nativeKey === key) return;
          await deps.platform.setTimer({ owner: snapshot.restOwner,
            clientWorkoutId: snapshot.restClientWorkoutId, generation: snapshot.restNotificationId,
            endsAtMs: snapshot.restEndsAtMs });
          nativeKey = key;
          nativeEnd = snapshot.restEndsAtMs;
        } else if (nativeKey && (!snapshot.activeWorkoutId || !nativeEnd || nativeEnd > deps.now())) {
          await deps.platform.setTimer(null);
          nativeKey = null;
          nativeEnd = null;
        }
        return;
      }
      if (status.available && nativeKey) {
        await deps.platform.setTimer(null);
        nativeKey = null;
        nativeEnd = null;
      }
      if (!deps.online()) return;
      if (!snapshot.isResting || !snapshot.restEndsAtMs) {
        if (serverEnd !== null && (!snapshot.activeWorkoutId || serverEnd > deps.now())) {
          await deps.cancel(serverId);
          serverEnd = null;
        }
        return;
      }
      if (serverEnd === snapshot.restEndsAtMs) return;
      serverId = snapshot.serverWorkoutId ?? undefined;
      await deps.schedule({ seconds: Math.max(1, Math.ceil((snapshot.restEndsAtMs - deps.now()) / 1000)),
        title: "Отдых завершён", text, workoutId: serverId });
      serverEnd = snapshot.restEndsAtMs;
    };
    queue = queue.catch(() => undefined).then(run);
    return queue;
  }

  async function finish(end: number | null, text: string, snapshot: TimerDeliverySnapshot) {
    const request = sequence;
    const status = await deps.platform.status();
    if (request !== sequence || (snapshot.restOwner && snapshot.restOwner !== deps.owner())) return;
    if (nativeMode(status) || !deps.online() || serverEnd === end) return;
    await deps.notify({ kind: "rest", title: "Отдых завершён", text,
      workoutId: snapshot.serverWorkoutId ?? undefined, startapp: "home" });
  }
  return { update, finish, dispose: () => { sequence += 1; } };
}

const delivery = createTimerNotificationDelivery({ platform: notificationPlatform, online: isOnline,
  owner: () => useUserStore.getState().user?.id ?? null,
  now: Date.now, schedule: scheduleTimerNotification, cancel: cancelTimerNotification, notify: notifyTimerEnded });
type ObserverOptions = { getText?: () => string; workoutId?: () => string | null | undefined;
  onError?: (error: unknown) => void };
let stopObserver: (() => void) | null = null;
const observers = new Set<ObserverOptions>();

function snapshot(fallback?: string | null): TimerDeliverySnapshot {
  const state = useWorkoutStore.getState();
  return { isResting: state.isResting, restEndsAtMs: state.restEndsAtMs,
    restNotificationId: state.restNotificationId, restOwner: state.restOwner,
    restClientWorkoutId: state.restClientWorkoutId, serverWorkoutId: state.serverWorkoutId || fallback || null,
    activeWorkoutId: state.activeWorkout?.id ?? null };
}

/** Bootstrap retains an observer while workout UI mounts and unmounts. */
export function installTimerNotificationDelivery(options: ObserverOptions = {}): () => void {
  observers.add(options);
  const update = () => {
    const current = Array.from(observers).at(-1);
    void delivery.update(snapshot(current?.workoutId?.()), current?.getText?.() ?? "Время продолжить тренировку")
      .catch((error: unknown) => {
        if (current?.onError) current.onError(error);
        else window.dispatchEvent(new CustomEvent("fitness:notification-delivery-error", {
          detail: { message: "Не удалось подготовить уведомление об отдыхе" },
        }));
      });
  };
  if (!stopObserver) {
    const unsubscribe = useWorkoutStore.subscribe((state, previous) => {
      if (state.restEndsAtMs !== previous.restEndsAtMs || state.restNotificationId !== previous.restNotificationId
        || state.serverWorkoutId !== previous.serverWorkoutId || state.activeWorkout !== previous.activeWorkout) update();
    });
    window.addEventListener("fitness:native-notifications-changed", update);
    stopObserver = () => { unsubscribe(); window.removeEventListener("fitness:native-notifications-changed", update); };
  }
  update();
  return () => {
    observers.delete(options);
    if (!observers.size) { stopObserver?.(); stopObserver = null; delivery.dispose(); }
  };
}

export function useTimerNotificationDelivery(getText: () => string, workoutId?: string | null) {
  const text = useRef(getText);
  text.current = getText;
  useEffect(() => installTimerNotificationDelivery({ getText: () => text.current(), workoutId: () => workoutId }), [workoutId]);
  return { finish: (end: number | null, message: string) => delivery.finish(end, message, snapshot(workoutId)) };
}
