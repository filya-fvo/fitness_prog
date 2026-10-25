import { z } from "zod";

const weight = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite().positive().max(10_000));
export const setMethodSchema = z.object({
  set_number: z.number().int().min(1).max(20), kind: z.enum(["drop", "cluster"]),
  parts: z.array(z.object({ target_reps: z.number().int().min(1).max(100_000),
    target_weight: weight.nullable().optional(), pause_after_sec: z.number().int().min(0).max(600).default(0),
  })).min(2).max(8),
});
export const workoutGroupSchema = z.object({
  id: z.string().uuid(), kind: z.enum(["superset", "triset", "circuit"]),
  exercise_ids: z.array(z.string().uuid()).min(2).max(20), rounds: z.number().int().min(1).max(20),
  transition_sec: z.number().int().min(0).max(600).default(0), round_rest_sec: z.number().int().min(0).max(600).default(90),
});
export const executionPartSchema = z.object({
  id: z.string().uuid(), ordinal: z.number().int().min(1).max(8),
  reps: z.number().int().min(0).max(100_000).nullable().default(null), weight: weight.nullable().default(null),
  duration_sec: z.number().int().min(0).max(86400).nullable().default(null),
  status: z.enum(["pending", "completed", "skipped"]), rest_after_sec: z.number().int().min(0).max(600),
});
export const workoutPlanSchema = z.object({
  execution_version: z.union([z.literal(1), z.literal(2)]).optional(),
  groups: z.array(workoutGroupSchema).max(10).optional(),
  customization_scopes: z.array(z.enum(["program_day", "occurrence"])).max(2).optional(),
  customization_revisions: z.record(z.string(), z.number().int().nonnegative()).optional(),
  title: z.string().nullable().optional(),
  workout_type: z.string().nullable().optional(),
  day_index: z.number().nullable().optional(),
  week_phase: z.string().nullable().optional(),
  week_in_cycle: z.number().nullable().optional(),
  week_label: z.string().nullable().optional(),
  week_rir: z.string().nullable().optional(),
  base_week_phase: z.string().nullable().optional(),
  load_adjustment: z.string().nullable().optional(),
  load_adjustment_label: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  equipment: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  exercises: z.array(z.object({
    exercise_id: z.string().uuid(),
    set_methods: z.array(setMethodSchema).max(20).optional(),
    order: z.number(),
    target_sets: z.number(),
    target_reps: z.string().nullable().optional(),
    rest_sec: z.number().nullable().optional(),
    name_ru: z.string().nullable().optional(),
    suggested_weight: z.union([z.number(), z.string()]).nullable().optional(),
    original_exercise_id: z.string().uuid().nullable().optional(),
    weight_mode: z.enum(["total", "per_hand"]).nullable().optional(),
    note: z.string().nullable().optional(),
  })),
});

const scheduleOccurrenceSchema = z.object({
  original_date: z.string(),
  target_date: z.string(),
  start_time: z.string(),
  title: z.string(),
  program_id: z.string().uuid().nullable().optional(),
  day_index: z.number().nullable().optional(),
  status: z.enum(["scheduled", "moved", "missed", "completed", "cancelled", "paused"]),
  is_override: z.boolean(),
  is_assignment: z.boolean().default(false),
  can_reschedule: z.boolean(),
  reschedule_until: z.string().nullable().optional(),
  can_cancel: z.boolean().default(false),
  cancel_to: z.string().nullable().optional(),
});

export const scheduleOverviewSchema = z.object({
  requested_date: z.string(),
  current: scheduleOccurrenceSchema.nullable().optional(),
  next: scheduleOccurrenceSchema.nullable().optional(),
  last_completed_date: z.string().nullable().optional(),
});

export const programSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  target_level: z.string().nullable().optional(),
  duration_weeks: z.number().nullable().optional(),
  structure: z.record(z.string(), z.unknown()).default({}),
  workout_type: z.string().default("custom"),
  level: z.string().nullable().optional(),
  is_template: z.boolean().default(true),
  publication_status: z.enum(["draft", "published", "archived"]).default("draft"),
  program_key: z.string().default(""),
  version: z.number().int().positive().default(1),
  is_current: z.boolean().default(false),
  published_at: z.string().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  personal_duration_min: z.number().int().min(5).max(240).nullable().optional(),
  personal_duration_sample_size: z.number().int().min(0).max(6).default(0),
});

export function mapProgram(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    target_level: item.target_level ?? null,
    duration_weeks: item.duration_weeks ?? null,
    structure: item.structure ?? {},
    workout_type: item.workout_type ?? "custom",
    level: item.level ?? null,
    is_template: item.is_template ?? true,
    publication_status: item.publication_status,
    program_key: item.program_key,
    version: item.version,
    is_current: item.is_current,
    published_at: item.published_at ?? null,
    owner_id: item.owner_id ?? null,
    personal_duration_min: item.personal_duration_min ?? null,
    personal_duration_sample_size: item.personal_duration_sample_size,
  };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const preparedWorkoutPlanSchema = workoutPlanSchema.extend({ exercises: z.array(workoutPlanSchema.shape.exercises.element.extend({ suggested_weight: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite().nonnegative()).nullable().optional() })) });
export const preparedProgramPlanSchema = z.object({
  exercise_defaults: z.object({ target_reps: z.string().min(1).max(30), rest_sec: z.number().int().min(0).max(600) }).nullable().optional(),
  preparation_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  scheduled_date: day, day_index: z.number().int().min(1).max(7),
  week_phase: z.enum(["light", "medium", "heavy"]),
  readiness: z.enum(["normal", "caution", "reduce", "rest"]), after_recovery: z.boolean().default(false), plan: preparedWorkoutPlanSchema,
});
export const offlineWorkoutContextSchema = z.object({
  version: z.literal(1), owner: z.string().uuid(), prepared_at: z.string().datetime({ offset: true }),
  schedule_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  start: day, end: day, program: programSchema.transform(mapProgram).nullable(),
  days: z.array(z.object({ requested_date: day, schedule: scheduleOverviewSchema })).min(1).max(14),
  plans: z.array(preparedProgramPlanSchema).max(3528),
}).superRefine((value, ctx) => {
  const expected = (Date.parse(value.end) - Date.parse(value.start)) / 86400000 + 1;
  if (expected !== value.days.length || value.days.some((row, i) => row.requested_date !== new Date(Date.parse(value.start) + i * 86400000).toISOString().slice(0, 10) || row.schedule.requested_date !== row.requested_date)) {
    ctx.addIssue({ code: "custom", message: "Неполный комплект расписания" });
  }
});

// The deployed cache serializes each parsed plan and reparses it when reading.
// Exact source lines are frozen in db-offlineWorkoutContext.ts.txt.
export function parseCachedPlans(input) {
  const bundle = offlineWorkoutContextSchema.parse(input);
  const saved = bundle.plans.map(plan => JSON.stringify(plan));
  return saved.map(value => preparedProgramPlanSchema.parse(JSON.parse(value)));
}
