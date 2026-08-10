/**
 * Simple client-side badges from workout history + habits.
 */
import type { Workout } from "@/types/workout";
import { computeStreak } from "@/utils/progress";
import { habitStreak } from "@/utils/habits";

export type Badge = {
  id: string;
  title: string;
  description: string;
  earned: boolean;
};

export function computeBadges(workouts: Workout[]): Badge[] {
  const completed = workouts.filter((w) => w.status === "completed");
  const streak = computeStreak(workouts);
  const hStreak = habitStreak();
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
      id: "streak_3",
      title: "Серия 3",
      description: "Серия тренировок 3 дня",
      earned: streak >= 3,
    },
    {
      id: "streak_7",
      title: "Неделя огня",
      description: "Серия тренировок 7 дней",
      earned: streak >= 7,
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
