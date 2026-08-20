import type { LocalSetDraft } from "@/types/workout";
import { formatElapsed } from "@/utils/format";

export type WorkoutCompletionFacts = {
  elapsedSec: number;
  completedSets: number;
  totalSets: number;
  completedExercises: number;
  totalExercises: number;
  tonnageKg: number;
  rpe: number;
  isPartial: boolean;
};

export function buildWorkoutCompletionFacts(input: {
  drafts: LocalSetDraft[];
  exerciseIds: string[];
  elapsedSec: number;
  rpe: number;
}): WorkoutCompletionFacts {
  const completed = input.drafts.filter((draft) => draft.isCompleted);
  const completedExerciseIds = new Set(completed.map((draft) => draft.exerciseId));
  const totalExerciseIds = new Set(input.exerciseIds);
  const tonnageKg = completed.reduce((total, draft) => {
    const reps = Number(draft.reps) || 0;
    const weight = Number(draft.weight) || 0;
    const multiplier = draft.weightMode === "per_hand" ? 2 : 1;
    return total + reps * weight * multiplier;
  }, 0);

  return {
    elapsedSec: Math.max(0, Math.floor(input.elapsedSec)),
    completedSets: completed.length,
    totalSets: input.drafts.length,
    completedExercises: completedExerciseIds.size,
    totalExercises: totalExerciseIds.size,
    tonnageKg,
    rpe: Math.max(1, Math.min(10, Math.round(input.rpe))),
    isPartial: completed.length < input.drafts.length,
  };
}

export function buildInstantWorkoutMessage(facts: WorkoutCompletionFacts): string {
  const progress = `${facts.completedExercises}/${facts.totalExercises} упр. и ${facts.completedSets}/${facts.totalSets} подходов`;
  const timing = formatElapsed(facts.elapsedSec);

  if (facts.isPartial) {
    return `Тренировка сохранена: ${progress} за ${timing}. Выполненный объём уже учтён — к плану можно вернуться в удобном темпе.`;
  }
  if (facts.rpe >= 9) {
    return `План выполнен полностью: ${progress} за ${timing}. Нагрузка была высокой — перед следующей тренировкой оцените восстановление.`;
  }
  return `План выполнен полностью: ${progress} за ${timing}. Отличная работа — тренировка сохранена в прогрессе.`;
}

export function buildWorkoutCoachPrompt(facts: WorkoutCompletionFacts): string {
  return [
    "Дай короткий комментарий после только что завершённой тренировки: 1–2 предложения на русском языке.",
    "Сначала отметь конкретный результат, затем добавь поддержку или одну практичную рекомендацию.",
    "Используй только перечисленные факты. Не придумывай рекорды, диагнозы, прошлые результаты или следующий день программы.",
    `Факты: время ${formatElapsed(facts.elapsedSec)}; упражнения ${facts.completedExercises}/${facts.totalExercises}; подходы ${facts.completedSets}/${facts.totalSets}; объём ${facts.tonnageKg.toFixed(1)} кг; RPE ${facts.rpe}/10; тренировка ${facts.isPartial ? "частичная" : "выполнена полностью"}.`,
  ].join(" ");
}
