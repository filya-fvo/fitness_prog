import { getStoredToken } from "@/api/client";
import { saveDailyMetrics } from "@/api/dailyMetrics";
import { useUserStore } from "@/store/userStore";
import { cacheHabitDay, getHabitDay, pendingCheckinDates } from "@/utils/habits";
import { isOnline } from "@/utils/network";

let checkinSync: Promise<unknown> = Promise.resolve();

export function syncCheckin(owner: string, date: string): Promise<boolean> {
  const sync = async () => {
    if (useUserStore.getState().user?.id !== owner || !getStoredToken() || !isOnline()) return false;
    const pending = getHabitDay(date, owner);
    if (!pending.metricsPending) return true;
    await saveDailyMetrics({
      sleepMinutes: pending.sleepHours == null ? null : Math.round(pending.sleepHours * 60),
      steps: pending.steps ?? null,
      activeMinutes: pending.activeMinutes ?? null,
    }, date);
    const latest = getHabitDay(date, owner);
    if (latest.metricsRevision === pending.metricsRevision) {
      cacheHabitDay({ ...latest, metricsPending: false }, owner);
    }
    return true;
  };
  const queued = checkinSync.then(async () => navigator.locks
    ? await navigator.locks.request(`fitness:checkin:${owner}:${date}`, sync)
    : await sync());
  checkinSync = queued.catch(() => undefined);
  return queued;
}

export function retryPendingCheckins(owner: string): void {
  if (!getStoredToken() || !isOnline()) return;
  for (const date of pendingCheckinDates(owner)) {
    void syncCheckin(owner, date).catch(() => {
      // Keep the edit pending until the next sync attempt.
    });
  }
}
