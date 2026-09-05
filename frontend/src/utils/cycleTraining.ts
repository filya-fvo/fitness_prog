import type { WorkoutPlan } from "@/types/workout";
import type { WeekPhase } from "@/utils/loadProgression";

export type CycleReadiness = "normal" | "caution" | "reduce" | "rest";

export const CYCLE_READINESS_OPTIONS: Array<{
  value: CycleReadiness;
  label: string;
  hint: string;
}> = [
  { value: "normal", label: "Как обычно", hint: "Цикл не мешает тренировке" },
  { value: "caution", label: "Осторожнее", hint: "Без предельной нагрузки" },
  { value: "reduce", label: "Полегче", hint: "Нужна лёгкая тренировка" },
  { value: "rest", label: "Отдых", hint: "Сегодня лучше восстановиться" },
];

export function isCycleReadiness(value: unknown): value is CycleReadiness {
  return ["normal", "caution", "reduce", "rest"].includes(String(value));
}

export function phaseFromPlan(plan: WorkoutPlan | null | undefined, fallback: WeekPhase): WeekPhase {
  const value = plan?.week_phase;
  return value === "light" || value === "medium" || value === "heavy" ? value : fallback;
}
