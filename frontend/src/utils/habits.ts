/**
 * Lightweight daily habits (water / weight / sleep) — local only.
 */
import { localDateKey } from "@/utils/progress";

const KEY = "fitness_habits_v1";

export type HabitDay = {
  date: string;
  waterMl: number;
  weightKg: number | null;
  sleepHours: number | null;
  checkedIn: boolean;
};

type Store = Record<string, HabitDay>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

export function getHabitDay(date = localDateKey(new Date())): HabitDay {
  const s = readStore();
  return (
    s[date] || {
      date,
      waterMl: 0,
      weightKg: null,
      sleepHours: null,
      checkedIn: false,
    }
  );
}

export function saveHabitDay(day: HabitDay): HabitDay {
  const s = readStore();
  const next = { ...day, checkedIn: true };
  s[day.date] = next;
  writeStore(s);
  return next;
}

export function addWater(ml: number, date = localDateKey(new Date())): HabitDay {
  const cur = getHabitDay(date);
  return saveHabitDay({ ...cur, waterMl: Math.max(0, cur.waterMl + ml) });
}

export function clearWaterHistory(): void {
  const store = readStore();
  for (const [date, day] of Object.entries(store)) {
    store[date] = { ...day, waterMl: 0 };
  }
  writeStore(store);
}

export function clearMeasurementHistory(): void {
  const store = readStore();
  for (const [date, day] of Object.entries(store)) {
    store[date] = { ...day, weightKg: null };
  }
  writeStore(store);
}

export function habitStreak(today = new Date()): number {
  const s = readStore();
  let streak = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // allow yesterday start
  if (!s[localDateKey(cursor)]?.checkedIn) {
    cursor.setDate(cursor.getDate() - 1);
    if (!s[localDateKey(cursor)]?.checkedIn) return 0;
  }
  while (s[localDateKey(cursor)]?.checkedIn) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
