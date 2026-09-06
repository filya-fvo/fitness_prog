/**
 * Simple client-side badges from workout history + habits.
 */
import type { Workout } from "@/types/workout";
import { habitStreak } from "@/utils/habits";

export type Badge = {
  id: string;
  title: string;
  description: string;
  earned: boolean;
};

export function computeBadges(
  workouts: Workout[],
  ownerUserId?: string | null,
  regularity?: { completion_pct: number | null; completed: number; planned: number } | null,
): Badge[] {
  const completed = workouts.filter((w) => w.status === "completed");
  const hStreak = habitStreak(new Date(), ownerUserId);
  const totalSets = completed.reduce(
    (acc, w) => acc + (w.sets || []).filter((s) => s.is_completed).length,
    0,
  );

  return [
    {
      id: "first_workout",
      title: "Первый шаг",
      description: "Завершите 1 тренировку",
      earned: completed.length >= 1,
    },
    {
      id: "five_workouts",
      title: "В ритме",
      description: "5 завершённых тренировок",
      earned: completed.length >= 5,
    },
    {
      id: "plan_3",
      title: "Точный ритм",
      description: "Выполнить 3 плановые тренировки без пропусков",
      earned: Boolean(regularity && regularity.planned >= 3 && regularity.completion_pct === 100),
    },
    {
      id: "plan_7",
      title: "План держится",
      description: "Выполнить не менее 90% из 7 плановых тренировок",
      earned: Boolean(regularity && regularity.planned >= 7 && (regularity.completion_pct ?? 0) >= 90),
    },
    {
      id: "sets_50",
      title: "50 подходов",
      description: "Суммарно 50 записанных подходов",
      earned: totalSets >= 50,
    },
    {
      id: "habit_3",
      title: "Чекин 3 дня",
      description: "Привычки отмечены 3 дня подряд",
      earned: hStreak >= 3,
    },
  ];
}
