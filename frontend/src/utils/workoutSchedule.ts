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

function shiftDate(value: string, days: number): string {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

export function assignmentTargetRange(
  overview: WorkoutScheduleOverview | null,
): { min: string; max: string; source: WorkoutScheduleOccurrence } | null {
  const source = overview?.next ?? null;
  if (!overview || !source || source.status !== "scheduled") return null;
  if (overview.current?.status === "scheduled" || overview.current?.status === "missed") {
    return null;
  }
  const min = overview.current?.status === "completed"
    ? shiftDate(overview.requested_date, 1)
    : overview.requested_date;
  const max = shiftDate(source.target_date, -1);
  return min <= max ? { min, max, source } : null;
}
