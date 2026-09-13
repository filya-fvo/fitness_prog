import type { ProgressDashboard } from "@/api/progressDashboard";
import type { PersonalRegularity } from "@/api/workouts";

export type AnalyticsDepth = "basic" | "standard" | "advanced";
export type DashboardSectionId = "measurements" | "nutrition" | "wellness" | "weekly" | "strength";

export const GOAL_DASHBOARD: Record<string, {
  label: string;
  description: string;
  sections: DashboardSectionId[];
}> = {
  lose_fat: {
    label: "Снижение веса",
    description: "Вес и талия, питание и сохранение силовых результатов",
    sections: ["measurements", "nutrition", "strength", "weekly", "wellness"],
  },
  gain_muscle: {
    label: "Набор мышц",
    description: "Силовая прогрессия, объём тренировок и динамика замеров",
    sections: ["strength", "weekly", "measurements", "nutrition", "wellness"],
  },
  maintain: {
    label: "Поддержание формы",
    description: "Регулярность, восстановление и стабильность результатов",
    sections: ["wellness", "weekly", "strength", "measurements", "nutrition"],
  },
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: "Новичок",
  intermediate: "Опытный",
  advanced: "Продвинутый",
};

export function analyticsDepth(
  level: unknown,
  advancedOverride: unknown,
): AnalyticsDepth {
  if (advancedOverride === true) return "advanced";
  if (advancedOverride === false && level === "advanced") return "standard";
  if (level === "advanced") return "advanced";
  if (level === "intermediate") return "standard";
  return "basic";
}

export function visibleDashboardSections(
  goal: unknown,
  depth: AnalyticsDepth,
): DashboardSectionId[] {
  const sections = GOAL_DASHBOARD[String(goal)]?.sections ?? GOAL_DASHBOARD.maintain.sections;
  if (depth === "basic") return sections.slice(0, 2);
  if (depth === "standard") return sections.slice(0, 4);
  return sections;
}

export type DashboardGuidance = {
  dataLabel: string;
  dataDescription: string;
  comparisonLabel: string;
  comparison: string;
  action: string;
  actionHref: string;
};

function workoutComparison(data: ProgressDashboard | null): string {
  if (!data) return "Сравнение появится после загрузки данных.";
  const delta = data.current.completed_workouts - data.previous.completed_workouts;
  if (delta === 0) return "Столько же завершённых тренировок, сколько в прошлом периоде.";
  return `${Math.abs(delta)} ${delta > 0 ? "больше" : "меньше"} завершённых тренировок, чем в прошлом периоде.`;
}

export function dashboardGuidance(input: {
  goal: unknown;
  dashboard: ProgressDashboard | null;
  regularity: PersonalRegularity | null;
  nutritionDays: number;
  wellnessDays: number;
}): DashboardGuidance {
  const { dashboard, regularity } = input;
  const workouts = dashboard?.current.completed_workouts ?? 0;
  const relevantPoints = workouts + input.nutritionDays + input.wellnessDays;
  const dataLabel = workouts >= 3 && relevantPoints >= 7 ? "Данных достаточно" : workouts > 0 || relevantPoints > 0 ? "Пока мало данных" : "Данных ещё нет";
  const dataDescription = workouts >= 3 && relevantPoints >= 7
    ? `Вывод основан на ${workouts} тренировках и ${input.nutritionDays + input.wellnessDays} дневных отметках за период.`
    : "Продолжайте отмечать тренировки и дневные показатели — выводы станут устойчивее.";
  const comparisonWeeks = (dashboard?.period_days ?? 28) / 7;
  const comparisonLabel = `Изменение за ${comparisonWeeks} ${comparisonWeeks === 4 ? "недели" : "недель"}`;

  if (workouts === 0) {
    return {
      dataLabel,
      dataDescription,
      comparisonLabel,
      comparison: workoutComparison(dashboard),
      action: "Завершить первую тренировку",
      actionHref: "/",
    };
  }
  if (regularity?.planned && (regularity.completion_pct ?? 100) < 70) {
    return {
      dataLabel,
      dataDescription,
      comparisonLabel,
      comparison: workoutComparison(dashboard),
      action: "Посмотреть ближайшую тренировку",
      actionHref: "/",
    };
  }
  if (input.goal === "lose_fat" && input.nutritionDays < 4) {
    return {
      dataLabel,
      dataDescription,
      comparisonLabel,
      comparison: workoutComparison(dashboard),
      action: "Заполнить питание сегодня",
      actionHref: "/nutrition",
    };
  }
  if (input.goal === "maintain" && input.wellnessDays < 4) {
    return {
      dataLabel,
      dataDescription,
      comparisonLabel,
      comparison: workoutComparison(dashboard),
      action: "Добавить сон и активность",
      actionHref: "/",
    };
  }
  return {
    dataLabel,
    dataDescription,
    comparisonLabel,
    comparison: workoutComparison(dashboard),
    action: input.goal === "gain_muscle" ? "Открыть динамику упражнений" : "Продолжить по плану",
    actionHref: input.goal === "gain_muscle" ? "/progress/exercises" : "/",
  };
}
