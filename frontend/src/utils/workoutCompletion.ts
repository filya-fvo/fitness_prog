import { draftVolume } from "./workoutLoad";
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
  completedParts?: number;
  totalParts?: number;
};

export function buildWorkoutCompletionFacts(input: {
  drafts: LocalSetDraft[];
  exerciseIds: string[];
  elapsedSec: number;
  rpe: number;
}): WorkoutCompletionFacts {
  const completed = input.drafts.filter((draft) => draft.isCompleted);
  const completedExerciseIds = new Set(input.drafts.filter(draft => draft.isCompleted || draft.parts?.some(part => part.status === "completed")).map(draft => draft.exerciseId));
  const totalExerciseIds = new Set(input.exerciseIds);
  const compound = input.drafts.filter(draft => draft.executionKind === "cluster" || draft.executionKind === "drop");
  const parts = compound.flatMap(draft => draft.parts ?? []);
  const completedParts = parts.filter(part => part.status === "completed").length;
  const tonnageKg = input.drafts.reduce((total, draft) => total + draftVolume(draft), 0);

  return {
    elapsedSec: Math.max(0, Math.floor(input.elapsedSec)),
    completedSets: completed.length,
    totalSets: input.drafts.length,
    completedExercises: completedExerciseIds.size,
    totalExercises: totalExerciseIds.size,
    tonnageKg,
    rpe: Math.max(1, Math.min(10, Math.round(input.rpe))),
    isPartial: completed.length < input.drafts.length || completedParts < parts.length,
    ...(parts.length ? { completedParts, totalParts: parts.length } : {}),
  };
}

export function buildInstantWorkoutMessage(facts: WorkoutCompletionFacts): string {
  const progress = `${facts.completedExercises}/${facts.totalExercises} упр. и ${facts.completedSets}/${facts.totalSets} подходов${facts.totalParts ? `, частей ${facts.completedParts ?? 0}/${facts.totalParts}` : ""}`;
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
    `Факты: время ${formatElapsed(facts.elapsedSec)}; упражнения ${facts.completedExercises}/${facts.totalExercises}; подходы ${facts.completedSets}/${facts.totalSets}; объём ${facts.tonnageKg.toFixed(1)} кг·повт;${facts.totalParts ? ` части сложных подходов ${facts.completedParts ?? 0}/${facts.totalParts};` : ""} RPE ${facts.rpe}/10; тренировка ${facts.isPartial ? "частичная" : "выполнена полностью"}.`,
  ].join(" ");
}
