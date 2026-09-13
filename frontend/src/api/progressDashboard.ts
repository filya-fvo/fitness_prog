import { z } from "zod";

import { apiClient } from "@/api/client";

export type ProgressDashboardPeriod = 28 | 56 | 84;

const decimalSchema = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());
const totalsSchema = z.object({
  completed_workouts: z.number().int().nonnegative(),
  active_days: z.number().int().nonnegative(),
  completed_sets: z.number().int().nonnegative(),
  planned_sets: z.number().int().nonnegative(),
  volume_kg: decimalSchema.pipe(z.number().nonnegative()),
  average_rpe: decimalSchema.pipe(z.number().min(1).max(10)).nullable(),
  rpe_workouts: z.number().int().nonnegative(),
});
const weekSchema = z.object({
  week_start: z.string(),
  week_end: z.string(),
  completed_workouts: z.number().int().nonnegative(),
  completed_sets: z.number().int().nonnegative(),
  planned_sets: z.number().int().nonnegative(),
  volume_kg: decimalSchema.pipe(z.number().nonnegative()),
});
const muscleGroupSchema = z.object({
  muscle_group: z.string(),
  completed_sets: z.number().int().nonnegative(),
  exercises: z.number().int().nonnegative(),
  volume_kg: decimalSchema.pipe(z.number().nonnegative()),
});
const dashboardSchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  period_days: z.union([z.literal(28), z.literal(56), z.literal(84)]),
  previous_period_start: z.string(),
  previous_period_end: z.string(),
  current: totalsSchema,
  previous: totalsSchema,
  weeks: z.array(weekSchema).max(13),
  muscle_groups: z.array(muscleGroupSchema).max(20),
  lifetime_completed_workouts: z.number().int().nonnegative(),
  lifetime_completed_sets: z.number().int().nonnegative(),
});

export type ProgressDashboard = z.infer<typeof dashboardSchema>;

export async function fetchProgressDashboard(
  periodDays: ProgressDashboardPeriod = 28,
): Promise<ProgressDashboard> {
  const { data } = await apiClient.get("/workouts/dashboard", {
    params: { period_days: periodDays },
  });
  return dashboardSchema.parse(data);
}
