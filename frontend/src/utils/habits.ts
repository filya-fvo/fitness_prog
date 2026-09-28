/**
 * Device cache for daily habits. Server-backed water is marked pending until synced.
 */
import { localDateKey } from "@/utils/progress";
import type { CycleReadiness } from "@/utils/cycleTraining";

const KEY = "fitness_habits_v1";
const MIGRATED_OWNER_KEY = "fitness_habits_v1_migrated_owner";

export type HabitDay = {
  date: string;
  waterMl: number;
  sleepHours: number | null;
  steps?: number | null;
  activeMinutes?: number | null;
  cycleReadiness?: CycleReadiness | null;
  cycleReadinessPending?: boolean;
  waterPending?: boolean;
  checkedIn: boolean;
};

export type DailyActivityCard = {
  id: "sleep" | "water" | "steps";
  label: string;
  value: string;
  detail: string;
  progress: number | null;
};

type DailyActivityInput = Pick<HabitDay, "sleepHours" | "waterMl" | "steps">;

function formatActivityNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value).replace(/\s/g, " ");
}

function formatSleep(hours: number): string {
  const minutes = Math.round(hours * 60);
  const wholeHours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${wholeHours} ч ${rest} мин` : `${wholeHours} ч`;
}

function formatWater(ml: number): string {
  return ml >= 1000
    ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(ml / 1000)} л`
    : `${formatActivityNumber(ml)} мл`;
}

export function activityCards(
  day: DailyActivityInput,
  targets: { sleepHours?: number; waterMl?: number; steps?: number } = {},
): DailyActivityCard[] {
  const sleepTarget = targets.sleepHours ?? 8;
  const waterTarget = targets.waterMl ?? 2500;
  const stepsTarget = targets.steps ?? 10000;
  const progress = (value: number | null | undefined, target: number) =>
    value == null ? null : Math.min(1, Math.max(0, value / target));

  return [
    {
      id: "sleep",
      label: "Сон",
      value: day.sleepHours == null ? "—" : formatSleep(day.sleepHours),
      detail: `из ${formatSleep(sleepTarget)}`,
      progress: progress(day.sleepHours, sleepTarget),
    },
    {
      id: "water",
      label: "Вода",
      value: formatWater(day.waterMl),
      detail: `из ${formatWater(waterTarget)}`,
      progress: progress(day.waterMl, waterTarget),
    },
    {
      id: "steps",
      label: "Шаги",
      value: day.steps == null ? "—" : formatActivityNumber(day.steps),
      detail: `из ${formatActivityNumber(stepsTarget)}`,
      progress: progress(day.steps, stepsTarget),
    },
  ];
}

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
        cycleReadiness: stored.cycleReadiness ?? null,
        cycleReadinessPending: stored.cycleReadinessPending === true,
        waterPending: stored.waterPending === true,
      }
    : {
      date,
      waterMl: 0,
      sleepHours: null,
      steps: null,
      activeMinutes: null,
      cycleReadiness: null,
      cycleReadinessPending: false,
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
