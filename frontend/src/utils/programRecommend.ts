import type { Program } from "@/types/workout";

export type RecommendInput = {
  primaryGoal?: string | null;
  level?: string | null;
  daysPerWeek?: number | null;
  equipment?: string[] | null;
};

const GOAL_TYPES: Record<string, string[]> = {
  lose_fat: ["home_express", "conditioning", "full_body", "push_pull_legs"],
  gain_muscle: ["hypertrophy", "push_pull_legs", "upper_lower", "full_body_alt", "strength"],
  maintain: ["full_body", "upper_lower", "home_express", "mobility"],
};

function programDays(program: Program): number {
  const structure = program.structure || {};
  const fromMeta = Number(structure.days_per_week);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  const schedule = (structure.schedule as unknown[]) || (structure.days as unknown[]) || [];
  return Array.isArray(schedule) ? schedule.length : 0;
}

function levelOf(program: Program): string {
  return (program.level || program.target_level || "").toLowerCase();
}

/**
 * Rule-based program ranking from onboarding profile.
 * Returns top matches first; never empty if catalog has items.
 */
export function recommendPrograms(programs: Program[], input: RecommendInput, limit = 3): Program[] {
  if (!programs.length) return [];

  const goal = (input.primaryGoal || "maintain").toLowerCase();
  const level = (input.level || "beginner").toLowerCase();
  const days = input.daysPerWeek ?? 3;
  const equipment = new Set((input.equipment || []).map((x) => x.toLowerCase()));
  const preferredTypes = GOAL_TYPES[goal] || GOAL_TYPES.maintain;

  const scored = programs.map((program) => {
    let score = 0;
    const pLevel = levelOf(program);
    const pType = (program.workout_type || "").toLowerCase();
    const pDays = programDays(program);

    if (pLevel && pLevel === level) score += 40;
    else if (pLevel && level === "beginner" && pLevel === "intermediate") score += 10;
    else if (pLevel && level === "advanced" && pLevel === "intermediate") score += 15;

    const typeIdx = preferredTypes.indexOf(pType);
    if (typeIdx >= 0) score += 30 - typeIdx * 4;

    if (pDays > 0) {
      const diff = Math.abs(pDays - days);
      score += Math.max(0, 20 - diff * 6);
    }

    // home bias if only bodyweight
    if (equipment.size === 1 && equipment.has("bodyweight") && pType === "home_express") {
      score += 18;
    }
    if (equipment.has("barbell") && (pType === "strength" || pType === "push_pull_legs")) {
      score += 8;
    }
    if (goal === "lose_fat" && pType === "mobility") score -= 5;
    if (program.is_template) score += 2;

    return { program, score };
  });

  scored.sort((a, b) => b.score - a.score || a.program.name.localeCompare(b.program.name, "ru"));
  return scored.slice(0, Math.max(1, limit)).map((x) => x.program);
}

export function pickTodayDayIndex(program: Program, now = new Date()): number {
  const days = Math.max(1, programDays(program));
  // Mon=0 .. Sun=6 → cycle through program days
  const weekday = (now.getDay() + 6) % 7;
  return (weekday % days) + 1;
}
