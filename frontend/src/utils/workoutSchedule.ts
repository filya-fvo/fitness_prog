import type {
  WorkoutScheduleOccurrence,
  WorkoutScheduleOverview,
} from "@/api/workouts";

export function startableWorkoutOccurrence(
  overview: WorkoutScheduleOverview | null,
): WorkoutScheduleOccurrence | null {
  const current = overview?.current ?? null;
  return current?.status === "scheduled" || current?.status === "missed"
    ? current
    : null;
}

export function plannedWorkoutOccurrence(
  overview: WorkoutScheduleOverview | null,
): WorkoutScheduleOccurrence | null {
  return startableWorkoutOccurrence(overview) ?? overview?.next ?? null;
}

export function canStartProgramFromSchedule(
  overview: WorkoutScheduleOverview | null,
): boolean {
  // Preserve offline/fallback operation when schedule could not be loaded.
  return overview === null || startableWorkoutOccurrence(overview) !== null;
}
