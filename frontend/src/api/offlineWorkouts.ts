import { z } from "zod";
import { apiClient } from "@/api/client";
import { programSchema, mapProgram } from "@/api/programs";
import { scheduleOverviewSchema, workoutPlanSchema } from "@/api/workouts";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const preparedWorkoutPlanSchema = workoutPlanSchema.extend({ exercises: z.array(workoutPlanSchema.shape.exercises.element.extend({ suggested_weight: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite().nonnegative()).nullable().optional() })) });
export const preparedProgramPlanSchema = z.object({
  scheduled_date: day, day_index: z.number().int().min(1).max(7),
  week_phase: z.enum(["light", "medium", "heavy"]),
  readiness: z.enum(["normal", "caution", "reduce", "rest"]), after_recovery: z.boolean().default(false), plan: preparedWorkoutPlanSchema,
});
export const offlineWorkoutContextSchema = z.object({
  version: z.literal(1), owner: z.string().uuid(), prepared_at: z.string().datetime({ offset: true }),
  start: day, end: day, program: programSchema.transform(mapProgram).nullable(),
  days: z.array(z.object({ requested_date: day, schedule: scheduleOverviewSchema })).min(1).max(14),
  plans: z.array(preparedProgramPlanSchema).max(3528),
}).superRefine((value, ctx) => {
  const expected = (Date.parse(value.end) - Date.parse(value.start)) / 86400000 + 1;
  if (expected !== value.days.length || value.days.some((row, i) => row.requested_date !== new Date(Date.parse(value.start) + i * 86400000).toISOString().slice(0, 10) || row.schedule.requested_date !== row.requested_date)) {
    ctx.addIssue({ code: "custom", message: "Неполный комплект расписания" });
  }
});
export type OfflineWorkoutBundle = z.infer<typeof offlineWorkoutContextSchema>;
export async function fetchOfflineWorkoutContext(start: string): Promise<OfflineWorkoutBundle> {
  const { data } = await apiClient.get("/workouts/offline-context", { params: { start, days: 14 }, timeout: 60000 });
  return offlineWorkoutContextSchema.parse(data);
}
