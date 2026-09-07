export const ACTIVATION_CHECKLIST_VERSION = 1;

export const ACTIVATION_CHECKLIST_ITEM_IDS = [
  "first_plan",
  "schedule",
  "first_set",
  "checkin",
  "measurement",
  "explore",
] as const;

export type ActivationChecklistItemId = (typeof ACTIVATION_CHECKLIST_ITEM_IDS)[number];

export const ACTIVATION_SIGNALS = [
  "plan_viewed",
  "schedule_saved",
  "set_logged",
  "checkin_saved",
  "measurement_saved",
  "measurement_skipped",
  "nutrition_opened",
  "faq_opened",
] as const;

export type ActivationSignal = (typeof ACTIVATION_SIGNALS)[number];

export type ActivationChecklistState = {
  version: typeof ACTIVATION_CHECKLIST_VERSION;
  started_at: string;
  signals: ActivationSignal[];
  snoozed_until: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
};

const SIGNAL_SET = new Set<string>(ACTIVATION_SIGNALS);

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length <= 64 ? value : null;
}

export function activationChecklistEnabled(value = import.meta.env.VITE_NEW_USER_CHECKLIST_ENABLED): boolean {
  return String(value ?? "true").trim().toLowerCase() !== "false";
}

export function createActivationChecklistState(now = new Date()): ActivationChecklistState {
  return {
    version: ACTIVATION_CHECKLIST_VERSION,
    started_at: now.toISOString(),
    signals: [],
    snoozed_until: null,
    completed_at: null,
    dismissed_at: null,
  };
}

export function readActivationChecklistState(value: unknown): ActivationChecklistState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== ACTIVATION_CHECKLIST_VERSION || typeof raw.started_at !== "string") return null;
  const signals = Array.isArray(raw.signals)
    ? Array.from(new Set(raw.signals.filter(
      (signal): signal is ActivationSignal => typeof signal === "string" && SIGNAL_SET.has(signal),
    )))
    : [];
  return {
    version: ACTIVATION_CHECKLIST_VERSION,
    started_at: raw.started_at.slice(0, 64),
    signals,
    snoozed_until: optionalText(raw.snoozed_until),
    completed_at: optionalText(raw.completed_at),
    dismissed_at: optionalText(raw.dismissed_at),
  };
}

export function completedActivationItems(signals: readonly ActivationSignal[]): ActivationChecklistItemId[] {
  const present = new Set(signals);
  return ACTIVATION_CHECKLIST_ITEM_IDS.filter((item) => {
    if (item === "first_plan") return present.has("plan_viewed");
    if (item === "schedule") return present.has("schedule_saved");
    if (item === "first_set") return present.has("set_logged");
    if (item === "checkin") return present.has("checkin_saved");
    if (item === "measurement") {
      return present.has("measurement_saved") || present.has("measurement_skipped");
    }
    return present.has("nutrition_opened") && present.has("faq_opened");
  });
}

export function addActivationSignals(
  state: ActivationChecklistState,
  signals: readonly ActivationSignal[],
  now = new Date(),
): ActivationChecklistState {
  if (state.completed_at || state.dismissed_at) return state;
  const merged = Array.from(new Set([...state.signals, ...signals]));
  const added = merged.length > state.signals.length;
  const completed = completedActivationItems(merged);
  return {
    ...state,
    signals: merged,
    snoozed_until: added ? null : state.snoozed_until,
    completed_at:
      completed.length === ACTIVATION_CHECKLIST_ITEM_IDS.length ? now.toISOString() : null,
  };
}

export function activationSignalsFromAnalytics(
  events: readonly unknown[],
  startedAt?: string,
): ActivationSignal[] {
  const signals = new Set<ActivationSignal>();
  for (const candidate of events) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as { event?: unknown; ts?: unknown };
    if (startedAt && (typeof entry.ts !== "string" || entry.ts < startedAt)) continue;
    const event = String(entry.event ?? "");
    if (event === "first_plan_viewed" || event === "workout_started") signals.add("plan_viewed");
    if (event === "schedule_saved") signals.add("schedule_saved");
    if (event === "set_logged") signals.add("set_logged");
    if (event === "habit_checked") signals.add("checkin_saved");
    if (event === "measurement_saved") signals.add("measurement_saved");
    if (event === "nutrition_opened") signals.add("nutrition_opened");
    if (event === "faq_opened") signals.add("faq_opened");
  }
  return [...signals];
}

export function activationChecklistIsVisible(
  state: ActivationChecklistState | null,
  localDate: string,
): boolean {
  if (!state || state.completed_at || state.dismissed_at) return false;
  return !state.snoozed_until || state.snoozed_until <= localDate;
}

export function nextLocalDate(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
