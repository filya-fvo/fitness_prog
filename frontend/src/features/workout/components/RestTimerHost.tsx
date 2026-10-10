import { memo, useEffect, useRef } from "react";
import { RestTimer } from "@/features/workout/components/RestTimer";
import { useTimerNotificationDelivery } from "@/features/workout/hooks/useTimerNotificationDelivery";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { useWorkoutStore } from "@/store/workoutStore";

export type RestContext = {
  exerciseName: string;
  nextExerciseName: string | null;
  isLastSetOfExercise: boolean;
  isLastExercise: boolean;
};
type Props = { restContext: RestContext | null; workoutId?: string | null };

export const RestTimerHost = memo(function RestTimerHost({ restContext, workoutId }: Props) {
  const isResting = useWorkoutStore((state) => state.isResting);
  const restSecondsLeft = useWorkoutStore((state) => state.restSecondsLeft);
  const syncRest = useWorkoutStore((state) => state.syncRest);
  const stopRest = useWorkoutStore((state) => state.stopRest);
  const adjustRest = useWorkoutStore((state) => state.adjustRest);
  const notified = useRef(false);
  const context = useRef(restContext);
  context.current = restContext;
  function message() {
    const ctx = context.current;
    if (ctx?.isLastSetOfExercise && ctx.nextExerciseName) return `Отдых завершён! Дальше: ${ctx.nextExerciseName} 💪`;
    if (ctx?.isLastSetOfExercise && ctx.isLastExercise) return "Отдых завершён! Это последнее упражнение — можно завершать тренировку 🏁";
    return `Отдых завершён! Продолжайте: ${ctx?.exerciseName || "тренировку"} 💪`;
  }
  const delivery = useTimerNotificationDelivery(message, workoutId);
  const finish = useRef(delivery.finish);
  finish.current = delivery.finish;

  useEffect(() => {
    if (!isResting) return;
    notified.current = false;
    const update = () => {
      const before = useWorkoutStore.getState();
      syncRest();
      if (before.restSecondsLeft <= 1 && !notified.current) {
        notified.current = true;
        hapticImpact("medium");
        hapticNotification("success");
        void finish.current(before.restEndsAtMs, message()).catch(() => {
          window.dispatchEvent(new CustomEvent("fitness:notification-delivery-error", {
            detail: { message: "Не удалось доставить уведомление об отдыхе" },
          }));
        });
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
  }, [isResting, syncRest]);

  if (!isResting) return null;
  return <RestTimer isResting={isResting} secondsLeft={restSecondsLeft} onSkip={stopRest} onAdjust={adjustRest} />;
});
