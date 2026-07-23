/**
 * Telegram analytics helpers (TZ §12).
 * Prefer WebApp.sendData when available; also keep a local event buffer for debugging.
 */

import { getTelegramWebApp } from "@/lib/telegram";

export type AnalyticsEventName =
  | "web_app_opened"
  | "workout_started"
  | "workout_completed"
  | "workout_exercise_completed"
  | "program_started"
  | "exercise_media_played"
  | "onboarding_completed"
  | "nutrition_logged"
  | "ai_message_sent";

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

const BUFFER_KEY = "fitness_analytics_buffer";

function pushLocal(event: string, payload: AnalyticsPayload): void {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    list.push({ event, payload, ts: new Date().toISOString() });
    // keep last 50
    localStorage.setItem(BUFFER_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // ignore quota / private mode
  }
}

/** Send analytics event to Telegram host (and local buffer). */
export function trackEvent(event: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  const body = {
    event,
    ...payload,
    ts: Date.now(),
  };
  pushLocal(event, payload);

  const wa = getTelegramWebApp() as
    | (ReturnType<typeof getTelegramWebApp> & { sendData?: (data: string) => void })
    | null;

  try {
    // Telegram.WebApp.sendData only works when opened via KeyboardButton web_app
    if (wa && typeof wa.sendData === "function") {
      wa.sendData(JSON.stringify(body));
    }
  } catch {
    // non-fatal outside supported contexts
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", event, payload);
  }
}

export function getAnalyticsBuffer(): unknown[] {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as unknown[]) : [];
  } catch {
    return [];
  }
}
