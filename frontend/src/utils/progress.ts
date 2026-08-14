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
    const weight = (set.weight ?? 0) * (set.weight_mode === "per_hand" ? 2 : 1);
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

export type NutritionBalanceDay = {
  date: string;
  calories: number;
  target: number | null;
  /** eaten - target; positive surplus, negative deficit */
  delta: number | null;
  hasLogs: boolean;
};

export type NutritionBalanceSummary = {
  days: NutritionBalanceDay[];
  dailyTarget: number | null;
  periodTarget: number | null;
  periodEaten: number;
  periodDelta: number | null;
};

/** Build day/week calorie balance series from /nutrition/range payload. */
export function buildNutritionBalance(input: {
  days: Array<{
    date: string;
    calories: number;
    target_calories?: number | null;
    delta_calories?: number | null;
    has_logs?: boolean;
  }>;
  daily_target_calories?: number | null;
  period_target_calories?: number | null;
  period_eaten_calories?: number;
  period_delta_calories?: number | null;
}): NutritionBalanceSummary {
  const dailyTarget =
    input.daily_target_calories != null && Number.isFinite(input.daily_target_calories)
      ? Number(input.daily_target_calories)
      : null;
  const days: NutritionBalanceDay[] = input.days.map((d) => {
    const target =
      d.target_calories != null && Number.isFinite(d.target_calories)
        ? Number(d.target_calories)
        : dailyTarget;
    const calories = Number(d.calories) || 0;
    const delta =
      d.delta_calories != null && Number.isFinite(d.delta_calories)
        ? Number(d.delta_calories)
        : target != null
          ? calories - target
          : null;
    return {
      date: d.date,
      calories,
      target,
      delta,
      hasLogs: Boolean(d.has_logs) || calories > 0,
    };
  });
  const periodEaten =
    input.period_eaten_calories != null
      ? Number(input.period_eaten_calories)
      : days.reduce((a, d) => a + d.calories, 0);
  const periodTarget =
    input.period_target_calories != null && Number.isFinite(input.period_target_calories)
      ? Number(input.period_target_calories)
      : dailyTarget != null
        ? dailyTarget * days.length
        : null;
  const periodDelta =
    input.period_delta_calories != null && Number.isFinite(input.period_delta_calories)
      ? Number(input.period_delta_calories)
      : periodTarget != null
        ? periodEaten - periodTarget
        : null;
  return {
    days,
    dailyTarget,
    periodTarget,
    periodEaten,
    periodDelta,
  };
}

/** Collapse daily series into one bar per ISO week (Mon-start) for week mode. */
export function groupNutritionByWeek(days: NutritionBalanceDay[]): NutritionBalanceDay[] {
  if (!days.length) return [];
  const groups = new Map<string, NutritionBalanceDay[]>();
  for (const day of days) {
    const d = new Date(`${day.date}T12:00:00`);
    const dow = d.getDay(); // 0 Sun
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const key = localDateKey(monday);
    const list = groups.get(key) ?? [];
    list.push(day);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, items]) => {
      const calories = items.reduce((a, x) => a + x.calories, 0);
      const targetParts = items.map((x) => x.target).filter((t): t is number => t != null);
      const target = targetParts.length ? targetParts.reduce((a, b) => a + b, 0) : null;
      const delta = target != null ? calories - target : null;
      return {
        date: weekStart,
        calories,
        target,
        delta,
        hasLogs: items.some((x) => x.hasLogs),
      };
    });
}

export type NutritionPeriodTotals = {
  /** human label, e.g. «Сегодня», «Эта неделя» */
  label: string;
  /** short range hint */
  rangeLabel: string;
  eaten: number;
  target: number | null;
  delta: number | null;
  daysCount: number;
  daysWithLogs: number;
};

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const dow = d.getDay(); // 0 Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function sumNutritionSlice(
  days: NutritionBalanceDay[],
  fromKey: string,
  toKey: string,
  dailyTarget: number | null,
): Pick<NutritionPeriodTotals, "eaten" | "target" | "delta" | "daysCount" | "daysWithLogs"> {
  const slice = days.filter((d) => d.date >= fromKey && d.date <= toKey);
  const eaten = slice.reduce((a, d) => a + d.calories, 0);
  const daysCount = slice.length;
  const daysWithLogs = slice.filter((d) => d.hasLogs || d.calories > 0).length;
  const targetFromDays = slice
    .map((d) => d.target)
    .filter((t): t is number => t != null && Number.isFinite(t));
  const target =
    targetFromDays.length > 0
      ? targetFromDays.reduce((a, b) => a + b, 0)
      : dailyTarget != null
        ? dailyTarget * daysCount
        : null;
  const delta = target != null ? eaten - target : null;
  return { eaten, target, delta, daysCount, daysWithLogs };
}

function shortRuDate(key: string): string {
  // YYYY-MM-DD → DD.MM
  if (key.length >= 10) return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
  return key;
}

/**
 * Three clear calorie windows for Progress:
 * - current calendar day
 * - current week (Mon–today)
 * - current month (1st–today)
 */
export function summarizeNutritionPeriods(
  days: NutritionBalanceDay[],
  dailyTarget: number | null,
  today = new Date(),
): { day: NutritionPeriodTotals; week: NutritionPeriodTotals; month: NutritionPeriodTotals } {
  const todayKey = localDateKey(today);
  const mon = mondayOf(today);
  const weekStartKey = localDateKey(mon);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);
  const monthStartKey = localDateKey(monthStart);

  const daySlice = sumNutritionSlice(days, todayKey, todayKey, dailyTarget);
  const weekSlice = sumNutritionSlice(days, weekStartKey, todayKey, dailyTarget);
  const monthSlice = sumNutritionSlice(days, monthStartKey, todayKey, dailyTarget);

  return {
    day: {
      label: "Сегодня",
      rangeLabel: shortRuDate(todayKey),
      ...daySlice,
    },
    week: {
      label: "Эта неделя",
      rangeLabel: `${shortRuDate(weekStartKey)}–${shortRuDate(todayKey)}`,
      ...weekSlice,
    },
    month: {
      label: "Этот месяц",
      rangeLabel: `${shortRuDate(monthStartKey)}–${shortRuDate(todayKey)}`,
      ...monthSlice,
    },
  };
}
