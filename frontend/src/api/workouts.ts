import { z } from "zod";

import { apiClient } from "@/api/client";
import type {
  ExerciseProgress,
  Workout,
  WorkoutLoadHint,
  WorkoutPlan,
  WorkoutSet,
} from "@/types/workout";

export const workoutPlanSchema = z.object({
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

const setSchema = z.object({
  id: z.string().uuid(),
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  set_number: z.number(),
  reps: z.number().nullable().optional(),
  weight: z.union([z.number(), z.string()]).nullable().optional(),
  weight_mode: z.enum(["total", "per_hand"]).nullable().optional(),
  is_completed: z.boolean(),
  rest_time_sec: z.number().nullable().optional(),
  duration_sec: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  machine_params: z.record(z.union([z.string(), z.number()])).nullable().optional(),
});

const workoutSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  program_id: z.string().uuid().nullable().optional(),
  scheduled_date: z.string(),
  status: z.string(),
  ai_notes: z.string().nullable().optional(),
  rpe: z.number().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  workout_type: z.string().nullable().optional(),
  plan: z.record(z.string(), z.unknown()).optional().default({}),
  duration_sec: z.number().nullable().optional(),
  sets: z.array(setSchema).default([]),
});

const scheduleOccurrenceSchema = z.object({
  original_date: z.string(),
  target_date: z.string(),
  start_time: z.string(),
  title: z.string(),
  program_id: z.string().uuid().nullable().optional(),
  day_index: z.number().nullable().optional(),
  status: z.enum(["scheduled", "moved", "missed", "completed", "cancelled"]),
  is_override: z.boolean(),
  can_reschedule: z.boolean(),
  reschedule_until: z.string().nullable().optional(),
  can_cancel: z.boolean().default(false),
  cancel_to: z.string().nullable().optional(),
});

const scheduleOverviewSchema = z.object({
  requested_date: z.string(),
  current: scheduleOccurrenceSchema.nullable().optional(),
  next: scheduleOccurrenceSchema.nullable().optional(),
});

const workoutLoadHintSchema = z.object({
  exercise_id: z.string().uuid(),
  weight: z.union([z.number(), z.string()]).nullable(),
  reps: z.number().int().nonnegative().nullable(),
  duration_sec: z.number().int().nonnegative().nullable(),
  weight_mode: z.enum(["total", "per_hand"]).nullable(),
  machine_params: z.record(z.union([z.string(), z.number()])).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
  completed_date: z.string(),
});

const exerciseWeekPhaseSchema = z.enum(["light", "medium", "heavy", "unknown"]);
const decimalSchema = z
  .union([z.number(), z.string()])
  .transform(Number)
  .pipe(z.number().finite());
const nonnegativeDecimalSchema = decimalSchema.pipe(z.number().nonnegative());
const exerciseProgressSetSchema = z.object({
  set_number: z.number().int().positive(),
  weight: nonnegativeDecimalSchema,
  total_weight: nonnegativeDecimalSchema,
  reps: z.number().int().positive(),
  weight_mode: z.enum(["total", "per_hand"]).nullable(),
});
const exerciseProgressSchema = z.object({
  exercise_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  points: z.array(z.object({
    date: z.string(),
    weight: nonnegativeDecimalSchema,
    total_weight: nonnegativeDecimalSchema,
    reps: z.number().int().positive(),
    estimated_1rm: nonnegativeDecimalSchema,
    weight_mode: z.enum(["total", "per_hand"]).nullable(),
    phase: exerciseWeekPhaseSchema,
  })).max(366),
  summary: z.object({
    total_weight: z.object({ latest: nonnegativeDecimalSchema.nullable(), best: nonnegativeDecimalSchema.nullable(), change: decimalSchema.nullable() }),
    estimated_1rm: z.object({ latest: nonnegativeDecimalSchema.nullable(), best: nonnegativeDecimalSchema.nullable(), change: decimalSchema.nullable() }),
  }),
  diary: z.array(z.object({
    workout_id: z.string().uuid(),
    date: z.string(),
    phase: exerciseWeekPhaseSchema,
    sets: z.array(exerciseProgressSetSchema),
  })).max(25),
  next_diary_cursor: z.string().nullable(),
});

const workoutScheduleSettingsSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().positive().default(1),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  start_time: z.string(),
  effective_from: z.string().nullable().optional(),
});

const workoutScheduleReplacementPreviewSchema = z.object({
  schedule_revision: z.number().int().positive(),
  source_weekday: z.number().int().min(0).max(6),
  target_weekday: z.number().int().min(0).max(6),
  effective_from: z.string(),
  previous_days: z.array(z.number().int().min(0).max(6)),
  new_days: z.array(z.number().int().min(0).max(6)),
  start_time: z.string(),
  upcoming_dates: z.array(z.string()).max(3),
  moves_current_occurrence: z.boolean(),
  conflict: z.literal("target_already_scheduled").nullable(),
  requires_conflict_resolution: z.boolean(),
  warning: z.string().nullable(),
});

const personalRegularitySchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  has_schedule: z.boolean(),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().nonnegative(),
  rescheduled_completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  completion_pct: z.number().min(0).max(100).nullable(),
});

export type WorkoutScheduleOccurrence = z.infer<typeof scheduleOccurrenceSchema>;
export type WorkoutScheduleOverview = z.infer<typeof scheduleOverviewSchema>;
export type WorkoutScheduleSettings = z.infer<typeof workoutScheduleSettingsSchema>;
export type WorkoutScheduleReplacementPreview = z.infer<typeof workoutScheduleReplacementPreviewSchema>;
export type PersonalRegularity = z.infer<typeof personalRegularitySchema>;

function mapSet(item: z.infer<typeof setSchema>): WorkoutSet {
  return {
    id: item.id,
    workout_id: item.workout_id,
    exercise_id: item.exercise_id,
    set_number: item.set_number,
    reps: item.reps ?? null,
    weight: item.weight == null ? null : Number(item.weight),
    weight_mode: item.weight_mode ?? null,
    is_completed: item.is_completed,
    rest_time_sec: item.rest_time_sec ?? null,
    duration_sec: item.duration_sec ?? null,
    note: item.note ?? null,
    machine_params: item.machine_params ?? null,
  };
}

function mapWorkout(item: z.infer<typeof workoutSchema>): Workout {
  return {
    id: item.id,
    user_id: item.user_id,
    program_id: item.program_id ?? null,
    scheduled_date: item.scheduled_date,
    status: item.status,
    ai_notes: item.ai_notes ?? null,
    rpe: item.rpe ?? null,
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    title: item.title ?? null,
    workout_type: item.workout_type ?? null,
    plan: (item.plan as Workout["plan"]) ?? {},
    duration_sec: item.duration_sec ?? null,
    sets: item.sets.map(mapSet),
  };
}

const workoutRequestsInFlight = new Map<string, Promise<Workout>>();
const recentWorkoutResponses = new Map<string, { workout: Workout; expiresAt: number }>();
const WORKOUT_RESPONSE_GRACE_MS = 5_000;

function invalidateWorkoutResponse(workoutId: string): void {
  recentWorkoutResponses.delete(workoutId);
}

export async function createWorkout(input: {
  clientWorkoutId?: string | null;
  scheduledDate: string;
  exerciseIds?: string[];
  programId?: string | null;
  dayIndex?: number | null;
  title?: string | null;
  workoutType?: string | null;
  setsPerExercise?: number;
  plan?: WorkoutPlan | null;
}): Promise<Workout> {
  const { data } = await apiClient.post("/workouts", {
    client_workout_id: input.clientWorkoutId ?? null,
    scheduled_date: input.scheduledDate,
    exercise_ids: input.exerciseIds ?? [],
    program_id: input.programId ?? null,
    day_index: input.dayIndex ?? null,
    title: input.title ?? null,
    workout_type: input.workoutType ?? null,
    sets_per_exercise: input.setsPerExercise ?? 3,
    plan: input.plan ?? null,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export function fetchWorkout(workoutId: string): Promise<Workout> {
  const cached = recentWorkoutResponses.get(workoutId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.workout);
  if (cached) recentWorkoutResponses.delete(workoutId);

  const existing = workoutRequestsInFlight.get(workoutId);
  if (existing) return existing;

  const request = apiClient
    .get(`/workouts/${workoutId}`)
    .then(({ data }) => {
      const workout = mapWorkout(workoutSchema.parse(data));
      recentWorkoutResponses.set(workoutId, {
        workout,
        expiresAt: Date.now() + WORKOUT_RESPONSE_GRACE_MS,
      });
      return workout;
    })
    .finally(() => workoutRequestsInFlight.delete(workoutId));
  workoutRequestsInFlight.set(workoutId, request);
  return request;
}

export async function updateWorkoutPlan(input: {
  workoutId: string;
  plan: WorkoutPlan;
}): Promise<Workout> {
  invalidateWorkoutResponse(input.workoutId);
  const { data } = await apiClient.put(`/workouts/${input.workoutId}/plan`, input.plan);
  return mapWorkout(workoutSchema.parse(data));
}

export async function addWorkoutSet(input: {
  workoutId: string;
  exerciseId: string;
  setNumber: number;
  reps?: number | null;
  weight?: number | null;
  weightMode?: "total" | "per_hand" | null;
  restTimeSec?: number | null;
  durationSec?: number | null;
  note?: string | null;
  machineParams?: Record<string, string | number> | null;
  isCompleted?: boolean;
}): Promise<WorkoutSet> {
  invalidateWorkoutResponse(input.workoutId);
  const { data } = await apiClient.post(`/workouts/${input.workoutId}/sets`, {
    exercise_id: input.exerciseId,
    set_number: input.setNumber,
    reps: input.reps ?? null,
    weight: input.weight ?? null,
    weight_mode: input.weightMode ?? null,
    rest_time_sec: input.restTimeSec ?? null,
    duration_sec: input.durationSec ?? null,
    note: input.note ?? null,
    machine_params: input.machineParams ?? null,
    is_completed: input.isCompleted ?? false,
  });
  return mapSet(setSchema.parse(data));
}

export async function completeWorkout(input: {
  workoutId: string;
  rpe?: number | null;
  aiNotes?: string | null;
}): Promise<Workout> {
  invalidateWorkoutResponse(input.workoutId);
  const { data } = await apiClient.put(`/workouts/${input.workoutId}/complete`, {
    rpe: input.rpe ?? null,
    ai_notes: input.aiNotes ?? null,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export async function updateWorkout(input: {
  workoutId: string;
  rpe: number | null;
  aiNotes: string | null;
}): Promise<Workout> {
  invalidateWorkoutResponse(input.workoutId);
  const { data } = await apiClient.patch(`/workouts/${input.workoutId}`, {
    rpe: input.rpe,
    ai_notes: input.aiNotes,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  invalidateWorkoutResponse(workoutId);
  await apiClient.delete(`/workouts/${workoutId}`);
}

export async function fetchWorkoutHistory(): Promise<Workout[]> {
  const { data } = await apiClient.get("/workouts/history");
  const parsed = z
    .object({
      items: z.array(workoutSchema),
      total: z.number(),
    })
    .parse(data);
  return parsed.items.map(mapWorkout);
}

export async function fetchWorkoutSchedule(day?: string): Promise<WorkoutScheduleOverview> {
  const { data } = await apiClient.get("/workouts/schedule/overview", {
    params: day ? { day } : undefined,
  });
  return scheduleOverviewSchema.parse(data);
}

export async function rescheduleWorkout(input: {
  originalDate: string;
  targetDate: string;
  targetTime: string;
}): Promise<WorkoutScheduleOverview> {
  const { data } = await apiClient.post("/workouts/schedule/reschedule", {
    original_date: input.originalDate,
    target_date: input.targetDate,
    target_time: input.targetTime,
  });
  return scheduleOverviewSchema.parse(data);
}

export async function fetchExerciseProgress(
  exerciseId: string,
  options: { periodDays?: number; phase?: "all" | "light" | "medium" | "heavy"; diaryLimit?: number; diaryCursor?: string | null } = {},
): Promise<ExerciseProgress> {
  const { data } = await apiClient.get(`/workouts/exercises/${exerciseId}/progress`, {
    params: {
      period_days: options.periodDays ?? 365,
      phase: options.phase ?? "all",
      diary_limit: options.diaryLimit ?? 1,
      ...(options.diaryCursor ? { diary_cursor: options.diaryCursor } : {}),
    },
  });
  const parsed = exerciseProgressSchema.parse(data);
  return {
    exerciseId: parsed.exercise_id,
    periodStart: parsed.period_start,
    periodEnd: parsed.period_end,
    points: parsed.points.map((point) => ({
      date: point.date,
      weight: point.weight,
      totalWeight: point.total_weight,
      reps: point.reps,
      estimated1rm: point.estimated_1rm,
      weightMode: point.weight_mode,
      phase: point.phase,
    })),
    diary: parsed.diary.map((item) => ({
      workoutId: item.workout_id,
      date: item.date,
      phase: item.phase,
      sets: item.sets.map((set) => ({
        setNumber: set.set_number,
        weight: set.weight,
        totalWeight: set.total_weight,
        reps: set.reps,
        weightMode: set.weight_mode,
      })),
    })),
    nextDiaryCursor: parsed.next_diary_cursor,
  };
}

export async function fetchWorkoutLoadHints(exerciseIds: string[]): Promise<WorkoutLoadHint[]> {
  const uniqueIds = [...new Set(exerciseIds)].slice(0, 100);
  if (!uniqueIds.length) return [];
  const { data } = await apiClient.post("/workouts/load-hints", {
    exercise_ids: uniqueIds,
  });
  const parsed = z.object({ items: z.array(workoutLoadHintSchema) }).parse(data);
  return parsed.items.map((item) => ({
    exerciseId: item.exercise_id,
    lastWeight: item.weight == null ? 0 : Number(item.weight),
    lastReps: item.reps ?? 0,
    lastDate: item.completed_date,
    lastDurationSec: item.duration_sec,
    lastWeightMode: item.weight_mode,
    lastMachineParams: item.machine_params,
    lastRpe: item.rpe,
  }));
}

export async function fetchWorkoutScheduleSettings(): Promise<WorkoutScheduleSettings> {
  const { data } = await apiClient.get("/workouts/schedule/settings");
  return workoutScheduleSettingsSchema.parse(data);
}

export async function saveWorkoutScheduleSettings(input: {
  days: number[];
  startTime: string;
}): Promise<WorkoutScheduleSettings> {
  const { data } = await apiClient.put("/workouts/schedule/settings", {
    days: input.days,
    start_time: input.startTime,
  });
  return workoutScheduleSettingsSchema.parse(data);
}

export type WorkoutScheduleReplacementInput = {
  originalDate: string;
  targetDate: string;
  targetTime: string;
  effectiveScope: "current_week" | "next_week";
  conflictResolution?: "reduce" | null;
};

export async function previewWorkoutScheduleReplacement(
  input: WorkoutScheduleReplacementInput,
): Promise<WorkoutScheduleReplacementPreview> {
  const { data } = await apiClient.post("/workouts/schedule/replacement/preview", {
    original_date: input.originalDate,
    target_date: input.targetDate,
    target_time: input.targetTime,
    effective_scope: input.effectiveScope,
    conflict_resolution: input.conflictResolution ?? null,
  });
  return workoutScheduleReplacementPreviewSchema.parse(data);
}

export async function replaceWorkoutScheduleDay(
  input: WorkoutScheduleReplacementInput & {
    expectedRevision: number;
    idempotencyKey: string;
  },
): Promise<{ settings: WorkoutScheduleSettings; overview: WorkoutScheduleOverview; applied: boolean }> {
  const { data } = await apiClient.post("/workouts/schedule/replacement", {
    original_date: input.originalDate,
    target_date: input.targetDate,
    target_time: input.targetTime,
    effective_scope: input.effectiveScope,
    conflict_resolution: input.conflictResolution ?? null,
    expected_revision: input.expectedRevision,
    idempotency_key: input.idempotencyKey,
  });
  const parsed = z.object({
    settings: workoutScheduleSettingsSchema,
    overview: scheduleOverviewSchema,
    applied: z.boolean(),
  }).parse(data);
  return parsed;
}

export async function fetchPersonalRegularity(days = 28): Promise<PersonalRegularity> {
  const { data } = await apiClient.get("/workouts/regularity", { params: { days } });
  return personalRegularitySchema.parse(data);
}

export async function cancelScheduledWorkout(scheduledDate: string): Promise<WorkoutScheduleOverview> {
  const { data } = await apiClient.post("/workouts/schedule/cancel", {
    scheduled_date: scheduledDate,
  });
  return scheduleOverviewSchema.parse(data);
}

export type PlannedWorkoutPlanInput = {
  programId: string;
  scheduledDate: string;
  dayIndex: number;
  weekPhase?: "light" | "medium" | "heavy" | null;
};

export async function fetchPlannedWorkoutPlan(
  input: PlannedWorkoutPlanInput,
): Promise<WorkoutPlan> {
  const { data } = await apiClient.get("/workouts/planned-plan", {
    params: {
      program_id: input.programId,
      scheduled_date: input.scheduledDate,
      day_index: input.dayIndex,
      week_phase: input.weekPhase ?? undefined,
    },
  });
  return workoutPlanSchema.parse(data) as WorkoutPlan;
}

export async function savePlannedWorkoutPlan(
  input: PlannedWorkoutPlanInput & {
    replacements: Array<{ fromExerciseId: string; toExerciseId: string }>;
  },
): Promise<WorkoutPlan> {
  const { data } = await apiClient.put("/workouts/planned-plan", {
    program_id: input.programId,
    scheduled_date: input.scheduledDate,
    day_index: input.dayIndex,
    week_phase: input.weekPhase ?? null,
    replacements: input.replacements.map((item) => ({
      from_exercise_id: item.fromExerciseId,
      to_exercise_id: item.toExerciseId,
    })),
  });
  return workoutPlanSchema.parse(data) as WorkoutPlan;
}
