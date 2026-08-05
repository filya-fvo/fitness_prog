/**
 * Product funnel metrics derived from local analytics buffer.
 * activation / D7 / time-to-first-set (P3).
 */
import { getAnalyticsBuffer } from "@/lib/analytics";

export type BufferedEvent = {
  event: string;
  payload?: Record<string, unknown>;
  ts?: string;
};

function asEvents(raw: unknown[]): BufferedEvent[] {
  return raw
    .filter((x): x is BufferedEvent => Boolean(x) && typeof x === "object")
    .map((x) => x as BufferedEvent);
}

function eventTime(e: BufferedEvent): number | null {
  if (e.ts) {
    const t = Date.parse(e.ts);
    if (Number.isFinite(t)) return t;
  }
  const p = e.payload?.ts;
  if (typeof p === "number" && Number.isFinite(p)) return p;
  return null;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type FunnelSnapshot = {
  opened: boolean;
  onboardingCompleted: boolean;
  /** activation = onboarding done + at least one set or workout completed */
  activated: boolean;
  firstOpenAt: string | null;
  firstSetAt: string | null;
  /** ms from web_app_opened → first set_logged (same session buffer) */
  timeToFirstSetMs: number | null;
  /** true if any activity on calendar day open+7 */
  d7Returned: boolean | null;
  counts: Record<string, number>;
};

export function summarizeFunnel(buffer: unknown[] = getAnalyticsBuffer()): FunnelSnapshot {
  const events = asEvents(buffer);
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.event] = (counts[e.event] || 0) + 1;
  }

  const openedEv = events.find((e) => e.event === "web_app_opened");
  const onboardEv = events.find((e) => e.event === "onboarding_completed");
  const firstSetEv = events.find((e) => e.event === "set_logged");
  const workoutDone = events.some((e) => e.event === "workout_completed");
  const programStarted = events.some(
    (e) => e.event === "program_started" || e.event === "workout_started",
  );

  const firstOpenMs = openedEv ? eventTime(openedEv) : null;
  const firstSetMs = firstSetEv ? eventTime(firstSetEv) : null;

  let timeToFirstSetMs: number | null = null;
  if (firstOpenMs != null && firstSetMs != null && firstSetMs >= firstOpenMs) {
    timeToFirstSetMs = firstSetMs - firstOpenMs;
  } else if (firstSetEv?.payload && typeof firstSetEv.payload.ms_from_workout_start === "number") {
    timeToFirstSetMs = Number(firstSetEv.payload.ms_from_workout_start);
  }

  let d7Returned: boolean | null = null;
  if (firstOpenMs != null) {
    const openDay = dayKey(firstOpenMs);
    const openDate = new Date(openDay + "T12:00:00");
    openDate.setDate(openDate.getDate() + 7);
    const d7 = dayKey(openDate.getTime());
    const times = events.map((e) => eventTime(e)).filter((t): t is number => t != null);
    const latest = times.length ? Math.max(...times) : firstOpenMs;
    const daysSinceOpen = Math.floor((latest - firstOpenMs) / 86_400_000);
    if (daysSinceOpen < 7) {
      d7Returned = null;
    } else {
      const activityDays = new Set(times.map((t) => dayKey(t)));
      // D7 = any event on calendar day open+7 or later
      d7Returned = [...activityDays].some((d) => d >= d7);
    }
  }

  const activated = Boolean(
    onboardEv || counts.onboarding_completed,
  ) && Boolean(firstSetEv || workoutDone || programStarted);

  return {
    opened: Boolean(openedEv || counts.web_app_opened),
    onboardingCompleted: Boolean(onboardEv || counts.onboarding_completed),
    activated,
    firstOpenAt: firstOpenMs ? new Date(firstOpenMs).toISOString() : null,
    firstSetAt: firstSetMs ? new Date(firstSetMs).toISOString() : null,
    timeToFirstSetMs,
    d7Returned,
    counts,
  };
}

/** Session mark for time-to-log-set within an active workout. */
const WORKOUT_START_KEY = "fitness_active_workout_started_ms";

export function markWorkoutTimerStart(ms = Date.now()): void {
  try {
    sessionStorage.setItem(WORKOUT_START_KEY, String(ms));
  } catch {
    /* private mode */
  }
}

export function msSinceWorkoutTimerStart(now = Date.now()): number | null {
  try {
    const raw = sessionStorage.getItem(WORKOUT_START_KEY);
    if (!raw) return null;
    const start = Number(raw);
    if (!Number.isFinite(start) || start <= 0) return null;
    return Math.max(0, now - start);
  } catch {
    return null;
  }
}
