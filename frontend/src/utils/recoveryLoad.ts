import type { DailyMetric } from "@/api/dailyMetrics";
import type { ProgressDashboard } from "@/api/progressDashboard";

type DashboardWeek = ProgressDashboard["weeks"][number];

export type RecoveryLoadRow = {
  weekStart: string;
  volumeKg: number;
  sleepMinutes: number | null;
  sleepDays: number;
};

export function pairWeeklyLoadAndSleep(weeks: DashboardWeek[], days: DailyMetric[]): RecoveryLoadRow[] {
  return weeks.map((week) => {
    const observed = days.filter((day) =>
      day.date >= week.week_start && day.date <= week.week_end &&
      day.sleep_minutes != null && Number.isFinite(day.sleep_minutes),
    );
    return {
      weekStart: week.week_start,
      volumeKg: week.volume_kg,
      sleepMinutes: observed.length
        ? Math.round(observed.reduce((sum, day) => sum + Number(day.sleep_minutes), 0) / observed.length)
        : null,
      sleepDays: observed.length,
    };
  });
}
