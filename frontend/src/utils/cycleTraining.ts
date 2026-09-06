import type { WorkoutPlan } from "@/types/workout";
import type { WeekPhase } from "@/utils/loadProgression";

export type CycleReadiness = "normal" | "caution" | "reduce" | "rest";

export const CYCLE_READINESS_OPTIONS: Array<{
  value: CycleReadiness;
  label: string;
  hint: string;
}> = [
  { value: "normal", label: "Всё хорошо", hint: "Оставить базовую нагрузку" },
  { value: "caution", label: "Без предельной нагрузки", hint: "Тяжёлая станет средней" },
  { value: "reduce", label: "Нужна лёгкая", hint: "Выполнить лёгкий вариант" },
  { value: "rest", label: "Нужно восстановление", hint: "Сначала предложим отложить" },
];

const FEMALE_SEX_VALUES = new Set(["f", "female", "woman", "ж", "жен", "женский", "женщина"]);
const UNSPECIFIED_SEX_VALUES = new Set(["", "unspecified", "not_specified", "не указан", "не указано"]);

export function cycleTrainingEnabledForProfile(
  goals: Record<string, unknown>,
  sex?: unknown,
): boolean {
  if (goals.cycle_training_enabled !== true) return false;
  const normalizedSex = String(sex || goals.sex || "").trim().toLowerCase();
  return FEMALE_SEX_VALUES.has(normalizedSex) || UNSPECIFIED_SEX_VALUES.has(normalizedSex);
}

export function isCycleReadiness(value: unknown): value is CycleReadiness {
  return ["normal", "caution", "reduce", "rest"].includes(String(value));
}

export function phaseFromPlan(plan: WorkoutPlan | null | undefined, fallback: WeekPhase): WeekPhase {
  const value = plan?.week_phase;
  return value === "light" || value === "medium" || value === "heavy" ? value : fallback;
}
