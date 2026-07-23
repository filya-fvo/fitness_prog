/**
 * Progress calculations — streak, volume, calendar marks (Sprint 3).
 */
import type { Workout } from "@/types/workout";

export type DayVolume = {
  date: string; // YYYY-MM-DD
  volume: number;
  workouts: number;
};

export type CalendarDay = {
  date: string;
  status: "completed" | "planned" | "skipped" | "none";
  count: number;
};

/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDateKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  // Date-only values from API are already calendar days.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }
  return localDateKey(parsed);
}

export function workoutDateKey(workout: Workout): string | null {
  return (
    toDateKey(workout.completed_at) ||
    toDateKey(workout.scheduled_date) ||
    toDateKey(workout.started_at)
  );
}

export function computeWorkoutVolume(workout: Workout): number {
  return workout.sets.reduce((acc, set) => {
    if (!set.is_completed) {
      return acc;
    }
    const reps = set.reps ?? 0;
    const weight = set.weight ?? 0;
    return acc + reps * weight;
  }, 0);
}

/** Consecutive completed-workout days ending today or yesterday. */
export function computeStreak(workouts: Workout[], today = new Date()): number {
  const completedDays = new Set(
    workouts
      .filter((w) => w.status === "completed")
      .map((w) => workoutDateKey(w))
      .filter((d): d is string => Boolean(d)),
  );

  if (completedDays.size === 0) {
    return 0;
  }

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Allow streak to continue if last workout was yesterday
  if (!completedDays.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!completedDays.has(localDateKey(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (completedDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computeDailyVolume(workouts: Workout[], days = 14, today = new Date()): DayVolume[] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const map = new Map<string, DayVolume>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = localDateKey(d);
    map.set(key, { date: key, volume: 0, workouts: 0 });
  }

  for (const workout of workouts) {
    if (workout.status !== "completed") {
      continue;
    }
    const key = workoutDateKey(workout);
    if (!key || !map.has(key)) {
      continue;
    }
    const row = map.get(key)!;
    row.volume += computeWorkoutVolume(workout);
    row.workouts += 1;
  }

  return Array.from(map.values());
}

export function buildCalendarDays(
  workouts: Workout[],
  year: number,
  monthIndex: number,
): CalendarDay[] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const days: CalendarDay[] = [];

  for (let d = new Date(first); d < next; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const dayWorkouts = workouts.filter((w) => workoutDateKey(w) === key);
    if (dayWorkouts.some((w) => w.status === "completed")) {
      days.push({
        date: key,
        status: "completed",
        count: dayWorkouts.filter((w) => w.status === "completed").length,
      });
    } else if (dayWorkouts.some((w) => w.status === "planned")) {
      days.push({
        date: key,
        status: "planned",
        count: dayWorkouts.length,
      });
    } else if (dayWorkouts.some((w) => w.status === "skipped")) {
      days.push({ date: key, status: "skipped", count: dayWorkouts.length });
    } else {
      days.push({ date: key, status: "none", count: 0 });
    }
  }
  return days;
}

export function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}
