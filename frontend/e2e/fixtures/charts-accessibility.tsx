import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Charts } from "../../src/features/progress/pages/Charts";
import { NutritionBalanceChart } from "../../src/features/progress/pages/NutritionBalanceChart";
import { TrainingLoadAnalytics } from "../../src/features/progress/pages/TrainingLoadAnalytics";
import { WeeklyOverview } from "../../src/features/progress/pages/WeeklyOverview";
import { WellnessSummary } from "../../src/features/progress/pages/WellnessSummary";
import { ExerciseProgressChart } from "../../src/features/workout/components/ExerciseProgressChart";
import type { ProgressDashboard } from "../../src/api/progressDashboard";
import "../../src/index.css";
const dates = Array.from({ length: 14 }, (_, index) => `2026-${index < 11 ? `09-${20 + index}` : `10-0${index - 10}`}`);
const volumes = dates.map((date, index) => ({ date, volume: index % 3 === 0 ? 1234.5 + index : 0, workouts: index % 3 === 0 ? 1 : 0 }));
const nutrition = dates.map((date, index) => ({ date, calories: index === 2 ? 0 : index === 1 ? 1900 : index === 5 ? 2000 : 2100 + index, target: index === 3 ? null : 2000, delta: index === 3 ? null : index === 1 ? -100 : index === 5 ? 0 : 100 + index, hasLogs: index !== 2 }));
const current = { completed_workouts: 4, active_days: 4, completed_sets: 48, planned_sets: 60, volume_kg: 12345.5, average_rpe: 7, rpe_workouts: 3 };
const dashboard: ProgressDashboard = {
  period_start: "2026-07-12", period_end: "2026-10-03", period_days: 84,
  previous_period_start: "2026-04-19", previous_period_end: "2026-07-11",
  current, previous: { ...current, volume_kg: 8000 }, lifetime_completed_workouts: 40, lifetime_completed_sets: 400,
  muscle_groups: [{ muscle_group: "Грудь", completed_sets: 12, exercises: 2, volume_kg: 1200 }],
  weeks: Array.from({ length: 12 }, (_, index) => ({ week_start: `2026-07-${String(index + 1).padStart(2, "0")}`, week_end: `2026-07-${String(index + 7).padStart(2, "0")}`, completed_workouts: 1, completed_sets: 12, planned_sets: 15, volume_kg: 1234.5 + index })),
};
createRoot(document.getElementById("root")!).render(<MemoryRouter><main style={{ maxWidth: 900, margin: "auto", padding: 16 }}>
  <div data-testid="volume"><Charts series={volumes} /></div>
  <div data-testid="nutrition"><NutritionBalanceChart mode="day" series={nutrition} dailyTarget={2000} periods={null} /></div>
  <div data-testid="load"><TrainingLoadAnalytics data={dashboard} loading={false} error={null} advanced onPeriodChange={() => undefined} /></div>
  <div data-testid="weekly"><WeeklyOverview overview={{ weekStart: dates[7], weekEnd: dates[13], rangeLabel: "27.09–03.10", days: volumes.slice(7).map((day, index) => ({ ...day, completed: day.workouts, weekdayShort: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"][index], isToday: index === 6 })), completedWorkouts: 2, activeDays: 2, totalVolume: 2481, totalSets: 20, avgRpe: 7, vsPrevWeek: { workoutsDelta: 1, volumeDelta: 1000, prevWorkouts: 1, prevVolume: 1481 }, tip: "Продолжайте по плану." }} /></div>
  <div data-testid="wellness"><WellnessSummary days={dates.map((date, index) => ({ date, steps: index === 2 ? null : 9000 + index * 100, sleep_minutes: index === 2 ? 0 : 480 + index, active_minutes: index * 5, sources: {} }))} /></div>
  <div data-testid="exercise"><ExerciseProgressChart allPoints={dates.map((date, index) => ({ date, weight: 20.5 + index, totalWeight: 20.5 + index, estimated1rm: 30.4 + index, reps: 10, phase: index % 2 ? "medium" : "heavy", weightMode: "total" }))} /></div>
</main></MemoryRouter>);
