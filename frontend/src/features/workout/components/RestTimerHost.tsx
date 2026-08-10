import { memo, useEffect, useRef } from "react";

import { notifyTimerEnded } from "@/api/notifications";
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
  const tickRest = useWorkoutStore((s) => s.tickRest);
  const stopRest = useWorkoutStore((s) => s.stopRest);
  const adjustRest = useWorkoutStore((s) => s.adjustRest);
  const restNotifySentRef = useRef(false);
  const ctxRef = useRef(restContext);
  ctxRef.current = restContext;

  useEffect(() => {
    if (!isResting) {
      restNotifySentRef.current = false;
      return;
    }
    const timer = window.setInterval(() => {
      const before = useWorkoutStore.getState().restSecondsLeft;
      tickRest();
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
        if (isOnline()) {
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
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isResting, tickRest, workoutId]);

  if (!isResting) return null;

  return (
    <RestTimer
      isResting={isResting}
      secondsLeft={restSecondsLeft}
      onSkip={stopRest}
      onAdjust={(delta) => adjustRest(delta)}
    />
  );
});
