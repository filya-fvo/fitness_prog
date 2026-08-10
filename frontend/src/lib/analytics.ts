/**
 * Analytics helpers (TZ §12).
 *
 * IMPORTANT: never call Telegram.WebApp.sendData from here.
 * sendData closes the Mini App and posts "Data from the Open button was
 * transferred to the bot" — that broke Open from reply keyboard / menu.
 * Events stay in a local buffer (and console in DEV).
 */

export type AnalyticsEventName =
  | "web_app_opened"
  | "workout_started"
  | "workout_completed"
  | "workout_exercise_completed"
  | "program_started"
  | "exercise_media_played"
  | "onboarding_completed"
  | "activation_completed"
  | "set_logged"
  | "nutrition_logged"
  | "nutrition_barcode_selected"
  | "ai_message_sent"
  | "reentry_shown"
  | "habit_checked";

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

/** Record analytics event locally (does not close Telegram Mini App). */
export function trackEvent(event: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  pushLocal(event, payload);

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
