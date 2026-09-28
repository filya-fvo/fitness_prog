/**
 * Soft coaching tips for Home (UX P2) — rule-based, no network.
 */

export type HomeTip = {
  id: string;
  text: string;
  ctaLabel?: string;
  ctaTo?: string;
};

export function buildHomeTips(input: {
  daysSinceLastWorkout: number | null;
  completedWorkouts: number;
  regularity: { completion_pct: number | null; completed: number; planned: number } | null;
  hasProgram: boolean;
  canResume: boolean;
  waterMl: number;
  waterTargetMl: number | null;
}): HomeTip[] {
  const tips: HomeTip[] = [];

  if (input.canResume) {
    tips.push({
      id: "resume",
      text: "Есть незакрытая тренировка — лучше добить подходы, чем начинать новую.",
      ctaLabel: "Продолжить",
      ctaTo: "/",
    });
  }

  if (!input.hasProgram && input.completedWorkouts === 0) {
    tips.push({
      id: "pick_program",
      text: "Выберите программу — так проще не думать «что делать сегодня».",
      ctaLabel: "Программы",
      ctaTo: "/programs",
    });
  }

  if (
    input.daysSinceLastWorkout != null &&
    input.daysSinceLastWorkout >= 3 &&
    input.daysSinceLastWorkout < 7 &&
    !input.canResume
  ) {
    tips.push({
      id: "gap3",
      text: `${input.daysSinceLastWorkout} дн. без тренировки — лёгкий день лучше, чем пропуск ещё раз.`,
      ctaLabel: "К тренировкам",
      ctaTo: "/train",
    });
  }

  if (
    input.regularity?.completion_pct != null &&
    input.regularity.completed >= 3 &&
    input.regularity.completion_pct >= 80
  ) {
    tips.push({
      id: "regularity",
      text: `План за 4 недели выполнен на ${input.regularity.completion_pct}% — хороший ритм.`,
    });
  }

  if (input.waterTargetMl != null && input.waterMl < input.waterTargetMl * 0.4) {
    tips.push({
      id: "water",
      text: `Вода ${input.waterMl} / ${input.waterTargetMl} мл — доберите стакан-два.`,
    });
  }

  // Max 2 tips to avoid noise
  return tips.slice(0, 2);
}
