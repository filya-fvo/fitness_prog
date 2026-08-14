import { memo, useEffect, useRef } from "react";

import {
  cancelTimerNotification,
  notifyTimerEnded,
  scheduleTimerNotification,
} from "@/api/notifications";
import { RestTimer } from "@/features/workout/components/RestTimer";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { useWorkoutStore } from "@/store/workoutStore";
import { isOnline } from "@/utils/network";

export type RestContext = {
  exerciseName: string;
  nextExerciseName: string | null;
  isLastSetOfExercise: boolean;
  isLastExercise: boolean;
};

type Props = {
  restContext: RestContext | null;
  workoutId?: string | null;
};

/**
 * Isolates rest countdown store ticks + UI from ActiveWorkout.
 * Parent no longer subscribes to isResting / restSecondsLeft every second.
 */
export const RestTimerHost = memo(function RestTimerHost({ restContext, workoutId }: Props) {
  const isResting = useWorkoutStore((s) => s.isResting);
  const restSecondsLeft = useWorkoutStore((s) => s.restSecondsLeft);
  const restEndsAtMs = useWorkoutStore((s) => s.restEndsAtMs);
  const syncRest = useWorkoutStore((s) => s.syncRest);
  const stopRest = useWorkoutStore((s) => s.stopRest);
  const adjustRest = useWorkoutStore((s) => s.adjustRest);
  const restNotifySentRef = useRef(false);
  const serverScheduledRef = useRef(false);
  const ctxRef = useRef(restContext);
  ctxRef.current = restContext;

  const cancelServerTimer = () => {
    serverScheduledRef.current = false;
    void cancelTimerNotification(
      useWorkoutStore.getState().serverWorkoutId || workoutId || undefined,
    ).catch(() => undefined);
  };

  useEffect(() => {
    if (!isResting) return;
    restNotifySentRef.current = false;
    const update = () => {
      const before = useWorkoutStore.getState().restSecondsLeft;
      syncRest();
      if (before <= 1 && !restNotifySentRef.current) {
        restNotifySentRef.current = true;
        hapticImpact("medium");
        hapticNotification("success");
        const ctx = ctxRef.current;
        const title = "Отдых завершён";
        let text = "Ваш отдых завершён! Время продолжить тренировку 💪";
        if (ctx) {
          if (ctx.isLastSetOfExercise && ctx.nextExerciseName) {
            text = `Отдых завершён! Дальше: ${ctx.nextExerciseName} 💪`;
          } else if (ctx.isLastSetOfExercise && ctx.isLastExercise) {
            text =
              "Отдых завершён! Это было последнее упражнение — можно завершать тренировку 🏁";
          } else {
            text = `Отдых завершён! Продолжайте: ${ctx.exerciseName} 💪`;
          }
        }
        if (isOnline() && !serverScheduledRef.current) {
          void notifyTimerEnded({
            kind: "rest",
            title,
            text,
            workoutId: useWorkoutStore.getState().serverWorkoutId || workoutId || undefined,
            startapp: "home",
          }).catch(() => {
            /* soft fail */
          });
        }
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
    };
  }, [isResting, syncRest, workoutId]);

  useEffect(() => {
    if (!isResting || !restEndsAtMs || !isOnline()) return;
    const seconds = Math.max(1, Math.ceil((restEndsAtMs - Date.now()) / 1000));
    const ctx = ctxRef.current;
    let text = ctx?.nextExerciseName && ctx.isLastSetOfExercise
      ? `Отдых завершён! Дальше: ${ctx.nextExerciseName} 💪`
      : `Отдых завершён! Продолжайте: ${ctx?.exerciseName || "тренировку"} 💪`;
    if (ctx?.isLastSetOfExercise && ctx.isLastExercise) {
      text = "Отдых завершён! Это последнее упражнение — можно завершать тренировку 🏁";
    }
    serverScheduledRef.current = false;
    void scheduleTimerNotification({
      seconds,
      title: "Отдых завершён",
      text,
      workoutId: useWorkoutStore.getState().serverWorkoutId || workoutId || undefined,
    })
      .then(() => { serverScheduledRef.current = true; })
      .catch(() => { serverScheduledRef.current = false; });
  }, [isResting, restEndsAtMs, workoutId]);

  if (!isResting) return null;

  return (
    <RestTimer
      isResting={isResting}
      secondsLeft={restSecondsLeft}
      onSkip={() => {
        stopRest();
        cancelServerTimer();
      }}
      onAdjust={(delta) => {
        adjustRest(delta);
        // The updated absolute end time triggers a replacement job in the effect.
      }}
    />
  );
});
