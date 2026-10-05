import type { Exercise, Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";
import { workoutDateKey } from "@/utils/progress";
import { estimate1rm } from "@/utils/strengthProgress";
import { formatDurationLabel } from "@/utils/exerciseLoadType";

export type HistorySet = { row: WorkoutSet; saved: boolean };
export type HistoryExercise = { exercise: Exercise; rows: HistorySet[] };
export type SetOutcome = "missing" | "better" | "steady" | "unknown";

export function buildWorkoutHistoryGroups(workout: Workout, catalog: Exercise[]): HistoryExercise[] {
  const plan = workout.plan as WorkoutPlan | null;
  const planned = [...(plan?.exercises ?? [])].sort((a, b) => a.order - b.order);
  const ids = new Set([...planned.map(item => item.exercise_id), ...workout.sets.map(row => row.exercise_id)]);
  return [...ids].map(id => {
    const item = planned.find(ex => ex.exercise_id === id);
    const saved = workout.sets.filter(row => row.exercise_id === id);
    const last = [...saved].sort((a, b) => b.set_number - a.set_number)[0];
    const exercise = catalog.find(ex => ex.id === id) ?? {
      id, name_ru: item?.name_ru || "Упражнение", muscle_group: "", equipment: null,
      description: null, technique: null, common_mistakes: null, difficulty: 1,
      video_url: null, animation_url: null, thumbnail_url: null, media_source: "none", media_duration_sec: null,
      tags: [last?.machine_params ? "load:cardio_machine" : last?.duration_sec != null ? "load:timed" : "load:weight_reps"],
    } satisfies Exercise;
    const count = Math.max(0, Math.min(20, Math.floor(item?.target_sets || 0)));
    const numbers = new Set([...Array.from({ length: count }, (_, index) => index + 1), ...saved.map(row => row.set_number)]);
    const rows = [...numbers].sort((a, b) => a - b).map(number => {
      const row = saved.find(set => set.set_number === number);
      return row ? { row, saved: true } : { row: emptyHistorySet(workout, exercise, number, last), saved: false };
    });
    return { exercise, rows };
  });
}

export function emptyHistorySet(workout: Workout, exercise: Exercise, number: number, last?: WorkoutSet): WorkoutSet {
  const planned = (workout.plan as WorkoutPlan | null)?.exercises?.find(item => item.exercise_id === exercise.id);
  return {
    id: `planned-${exercise.id}-${number}`, workout_id: workout.id, exercise_id: exercise.id, set_number: number,
    reps: last?.reps ?? null, weight: last?.weight ?? planned?.suggested_weight ?? null,
    weight_mode: last ? last.weight_mode ?? null : planned?.weight_mode ?? (exercise.weight_rule === "per_hand" ? "per_hand" : null),
    rest_time_sec: last?.rest_time_sec ?? planned?.rest_sec ?? 60, duration_sec: last?.duration_sec ?? null,
    note: null, machine_params: last?.machine_params ?? null, is_completed: false,
  };
}

/** Previous performed session, never this session or a future calendar day. */
export function previousExerciseSets(workout: Workout, history: Workout[], exerciseId: string): WorkoutSet[] {
  const currentDay = workoutDateKey(workout) ?? workout.scheduled_date;
  const candidates = history.filter(item => {
    if (item.id === workout.id || item.status !== "completed") return false;
    const day = workoutDateKey(item) ?? item.scheduled_date;
    const earlier = day < currentDay || (day === currentDay && !!item.started_at && !!workout.started_at && item.started_at < workout.started_at);
    return earlier && item.sets.some(row => row.exercise_id === exerciseId && row.is_completed);
  }).sort((a, b) => (workoutDateKey(b) ?? b.scheduled_date).localeCompare(workoutDateKey(a) ?? a.scheduled_date)
    || (b.started_at ?? "").localeCompare(a.started_at ?? ""));
  return candidates[0]?.sets.filter(row => row.exercise_id === exerciseId && row.is_completed) ?? [];
}

/** Compare the same ordinal set; weight is normalized just like strength charts. */
export function historySetOutcome(row: WorkoutSet, previous?: WorkoutSet): SetOutcome {
  if (!row.is_completed) return "missing";
  if (!previous?.is_completed || row.exercise_id !== previous.exercise_id || row.machine_params || previous.machine_params) return "unknown";
  if (row.duration_sec != null || previous.duration_sec != null) {
    if (row.duration_sec == null || previous.duration_sec == null) return "unknown";
    return row.duration_sec > previous.duration_sec ? "better" : "steady";
  }
  if (row.reps == null || previous.reps == null || row.reps <= 0 || previous.reps <= 0) return "unknown";
  const weight = (row.weight ?? 0) * (row.weight_mode === "per_hand" ? 2 : 1);
  const priorWeight = (previous.weight ?? 0) * (previous.weight_mode === "per_hand" ? 2 : 1);
  if (!weight && !priorWeight) return row.reps > previous.reps ? "better" : "steady";
  if (!weight || !priorWeight) return "unknown";
  return estimate1rm(weight, row.reps) > estimate1rm(priorWeight, previous.reps) ? "better" : "steady";
}

export function historySetLoad(row: WorkoutSet): string {
  if (row.duration_sec != null) return formatDurationLabel(row.duration_sec);
  return `${row.weight != null ? `${row.weight} кг × ` : ""}${row.reps ?? "—"}${row.weight_mode === "per_hand" ? " / рука" : ""}`;
}
