import type { Workout } from "@/types/workout";
import { estimate1rm } from "@/utils/strengthProgress";
import { workoutDateKey } from "@/utils/progress";

export type ExerciseWeekPhase = "light" | "medium" | "heavy" | "unknown";

export type ExerciseProgressPoint = {
  date: string;
  weight: number;
  reps: number;
  estimated1rm: number;
  phase: ExerciseWeekPhase;
};

export type ExerciseDiarySession = {
  date: string;
  phase: ExerciseWeekPhase;
  sets: Array<{ setNumber: number; weight: number; reps: number }>;
};

function workoutPhase(workout: Workout): ExerciseWeekPhase {
  const phase = String((workout.plan as { week_phase?: unknown } | null)?.week_phase ?? "");
  return phase === "light" || phase === "medium" || phase === "heavy" ? phase : "unknown";
}

export function buildExerciseProgress(
  workouts: Workout[],
  exerciseId: string,
): ExerciseProgressPoint[] {
  const byDay = new Map<string, ExerciseProgressPoint>();

  for (const workout of workouts) {
    if (workout.status !== "completed") continue;
    const date = workoutDateKey(workout);
    if (!date) continue;

    const candidates = workout.sets
      .filter((set) => set.exercise_id === exerciseId && set.is_completed)
      .map((set) => ({
        weight: Number(set.weight) || 0,
        reps: Number(set.reps) || 0,
      }))
      .filter((set) => set.weight > 0 && set.reps > 0)
      .map((set) => ({ ...set, estimated1rm: estimate1rm(set.weight, set.reps) }));
    if (!candidates.length) continue;

    const best = candidates.reduce((current, item) =>
      item.estimated1rm > current.estimated1rm ? item : current,
    );
    const point = { date, ...best, phase: workoutPhase(workout) };
    const previous = byDay.get(date);
    if (!previous || point.estimated1rm > previous.estimated1rm) byDay.set(date, point);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function filterExerciseProgress(
  points: ExerciseProgressPoint[],
  periodDays: number,
  phase: "all" | Exclude<ExerciseWeekPhase, "unknown">,
  now = new Date(),
): ExerciseProgressPoint[] {
  const threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  threshold.setDate(threshold.getDate() - periodDays + 1);
  const thresholdIso = `${threshold.getFullYear()}-${String(threshold.getMonth() + 1).padStart(2, "0")}-${String(threshold.getDate()).padStart(2, "0")}`;
  return points.filter((point) => point.date >= thresholdIso && (phase === "all" || point.phase === phase));
}

export function buildExerciseDiary(
  workouts: Workout[],
  exerciseId: string,
  limit = 3,
): ExerciseDiarySession[] {
  return workouts
    .filter((workout) => workout.status === "completed")
    .map((workout) => {
      const date = workoutDateKey(workout);
      const sets = workout.sets
        .filter((set) => set.exercise_id === exerciseId && set.is_completed)
        .map((set) => ({
          setNumber: set.set_number,
          weight: Number(set.weight) || 0,
          reps: Number(set.reps) || 0,
        }))
        .filter((set) => set.weight > 0 && set.reps > 0)
        .sort((a, b) => a.setNumber - b.setNumber);
      return date && sets.length ? { date, phase: workoutPhase(workout), sets } : null;
    })
    .filter((session): session is ExerciseDiarySession => session != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, Math.max(1, limit));
}
