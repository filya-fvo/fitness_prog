/**
 * Device cache for daily habits. Server-backed water is marked pending until synced.
 */
import { localDateKey } from "@/utils/progress";

const KEY = "fitness_habits_v1";
const MIGRATED_OWNER_KEY = "fitness_habits_v1_migrated_owner";

export type HabitDay = {
  date: string;
  waterMl: number;
  sleepHours: number | null;
  steps?: number | null;
  activeMinutes?: number | null;
  waterPending?: boolean;
  checkedIn: boolean;
};

type Store = Record<string, HabitDay>;

function ownerKey(ownerUserId?: string | null): string {
  return ownerUserId ? `${KEY}:${ownerUserId}` : KEY;
}

function migrateLegacyStore(ownerUserId?: string | null): void {
  if (!ownerUserId || localStorage.getItem(ownerKey(ownerUserId))) return;
  const legacy = localStorage.getItem(KEY);
  if (!legacy || localStorage.getItem(MIGRATED_OWNER_KEY)) return;
  try {
    const parsed = JSON.parse(legacy) as unknown;
    if (!parsed || typeof parsed !== "object") return;
    localStorage.setItem(ownerKey(ownerUserId), legacy);
    localStorage.setItem(MIGRATED_OWNER_KEY, ownerUserId);
    localStorage.removeItem(KEY);
  } catch {
    // Ignore an invalid legacy cache. Server data remains the source of truth.
  }
}

function readStore(ownerUserId?: string | null): Store {
  try {
    migrateLegacyStore(ownerUserId);
    const raw = localStorage.getItem(ownerKey(ownerUserId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(s: Store, ownerUserId?: string | null) {
  try {
    localStorage.setItem(ownerKey(ownerUserId), JSON.stringify(s));
  } catch {
    /* quota */
  }
}

export function getHabitDay(
  date = localDateKey(new Date()),
  ownerUserId?: string | null,
): HabitDay {
  const s = readStore(ownerUserId);
  const stored = s[date];
  return stored
    ? {
        ...stored,
        steps: stored.steps ?? null,
        activeMinutes: stored.activeMinutes ?? null,
        waterPending: stored.waterPending === true,
      }
    : {
      date,
      waterMl: 0,
      sleepHours: null,
      steps: null,
      activeMinutes: null,
      waterPending: false,
      checkedIn: false,
    };
}

export function cacheHabitDay(day: HabitDay, ownerUserId?: string | null): HabitDay {
  const s = readStore(ownerUserId);
  const next = { ...day };
  s[day.date] = next;
  writeStore(s, ownerUserId);
  return next;
}

export function saveHabitDay(day: HabitDay, ownerUserId?: string | null): HabitDay {
  const s = readStore(ownerUserId);
  const next = { ...day, checkedIn: true };
  s[day.date] = next;
  writeStore(s, ownerUserId);
  return next;
}

export function addWater(
  ml: number,
  date = localDateKey(new Date()),
  ownerUserId?: string | null,
): HabitDay {
  const cur = getHabitDay(date, ownerUserId);
  return saveHabitDay(
    { ...cur, waterMl: Math.max(0, cur.waterMl + ml), waterPending: true },
    ownerUserId,
  );
}

export function clearWaterHistory(ownerUserId?: string | null): void {
  const store = readStore(ownerUserId);
  for (const [date, day] of Object.entries(store)) {
    store[date] = { ...day, waterMl: 0, waterPending: false };
  }
  writeStore(store, ownerUserId);
}

export function clearLegacyWeightHistory(ownerUserId?: string | null): void {
  const store = readStore(ownerUserId);
  for (const [date, day] of Object.entries(store)) {
    const withoutWeight = { ...day } as HabitDay & { weightKg?: number | null };
    delete withoutWeight.weightKg;
    store[date] = withoutWeight;
  }
  writeStore(store, ownerUserId);
}

export function clearHabitHistory(ownerUserId?: string | null): void {
  localStorage.removeItem(ownerKey(ownerUserId));
}

export function adoptHabitHistory(oldUserId: string, newUserId: string): void {
  const oldStore = readStore(oldUserId);
  if (!Object.keys(oldStore).length) return;
  const targetStore = readStore(newUserId);
  writeStore({ ...oldStore, ...targetStore }, newUserId);
  localStorage.removeItem(ownerKey(oldUserId));
}

export function habitStreak(today = new Date(), ownerUserId?: string | null): number {
  const s = readStore(ownerUserId);
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
