export type RestTimerIdentity = { owner: string | null; clientWorkoutId: string | null };
export type RestTimerRecord = RestTimerIdentity & {
  version: 2; restNotificationId: string | null; endsAtMs: number;
};
type TimerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const LEGACY_KEY = "fitness_rest_timer_v1";
const KEY = "fitness_rest_timer_v2";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const matches = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

export function createRestTimer(seconds: number, identity: RestTimerIdentity, now = Date.now()): RestTimerRecord {
  const owned = matches(identity.owner) && matches(identity.clientWorkoutId);
  return { version: 2, owner: owned ? identity.owner : null,
    clientWorkoutId: owned ? identity.clientWorkoutId : null,
    restNotificationId: owned ? crypto.randomUUID() : null,
    endsAtMs: now + Math.max(0, Math.min(600, Math.round(seconds))) * 1000 };
}

export function writeRestTimer(record: RestTimerRecord | null, storage?: TimerStorage): void {
  try {
    storage ??= localStorage;
    storage.removeItem(LEGACY_KEY);
    if (record) storage.setItem(KEY, JSON.stringify(record));
    else storage.removeItem(KEY);
  } catch { /* Countdown still works when storage is unavailable. */ }
}

export function readRestTimer(
  identity: RestTimerIdentity = { owner: null, clientWorkoutId: null },
  now = Date.now(), storage?: TimerStorage,
): RestTimerRecord | null {
  try {
    storage ??= localStorage;
    const raw = storage.getItem(KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null) return null;
      const row = value as Record<string, unknown>;
      if (row.version !== 2 || typeof row.endsAtMs !== "number" || !Number.isFinite(row.endsAtMs)
        || row.endsAtMs <= now || row.endsAtMs > now + 600_000) return null;
      if (row.owner !== null && (!matches(row.owner) || !matches(row.clientWorkoutId)
        || !matches(row.restNotificationId) || row.owner !== identity.owner
        || row.clientWorkoutId !== identity.clientWorkoutId)) return null;
      if (row.owner === null && (row.clientWorkoutId !== null || row.restNotificationId !== null)) return null;
      return row as RestTimerRecord;
    }
    const end = Number(storage.getItem(LEGACY_KEY));
    if (Number.isFinite(end) && end > now && end <= now + 600_000) {
      return { version: 2, owner: null, clientWorkoutId: null, restNotificationId: null, endsAtMs: end };
    }
  } catch { /* A corrupt record cannot become a native alarm. */ }
  return null;
}
