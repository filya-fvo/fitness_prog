import { db } from "@/db/schema";
import { useUserStore } from "@/store/userStore";
import type { Workout } from "@/types/workout";

type Protection = { pendingIds: string[]; deletedIds: string[] };
let platformProtection: (owner: string) => Promise<Protection> = async () => ({ pendingIds: [], deletedIds: [] });
export function installWorkoutHistoryProtection(read: typeof platformProtection): void { platformProtection = read; }

/** Reconcile only complete server windows; outside history and local edits survive. */
export async function cacheWorkoutHistory(owner: string, items: Workout[], windows: { start: string; end: string }[]): Promise<Workout[]> {
  const check = () => { if (useUserStore.getState().user?.id !== owner) throw new Error("Аккаунт изменился во время обновления дневника"); };
  check();
  if (items.some(item => item.user_id !== owner)) throw new Error("Ответ дневника принадлежит другому аккаунту");
  return db.transaction("rw", db.tables, async () => {
    check();
    const protection = await platformProtection(owner);
    const pending = new Set(protection.pendingIds), deleted = new Set(protection.deletedIds);
    const queue = await db.syncQueue.where("ownerUserId").equals(owner).toArray();
    const aliases = await db.workoutIdMap.where("ownerUserId").equals(owner).toArray();
    for (const operation of queue) {
      if (!["create_workout", "update_plan", "add_set", "complete_workout", "delete_workout"].includes(operation.type)) continue;
      const ids = [operation.clientWorkoutId, ...aliases.filter(row => row.clientId === operation.clientWorkoutId).map(row => row.serverId)];
      ids.forEach(id => { pending.add(id); if (operation.type === "delete_workout") deleted.add(id); });
    }
    const current = await db.workouts.where("user_id").equals(owner).toArray();
    const local = new Map(current.map(item => [item.id, item]));
    const incoming = new Set(items.map(item => item.id));
    const removed = current.filter(item => deleted.has(item.id) || (!pending.has(item.id) && !incoming.has(item.id) && windows.some(range => item.scheduled_date >= range.start && item.scheduled_date <= range.end)));
    if (removed.length) await db.workouts.bulkDelete(removed.map(item => item.id));
    const saved = items.filter(item => !deleted.has(item.id)).map(item => pending.has(item.id) ? local.get(item.id) ?? item : item);
    if (saved.length) await db.workouts.bulkPut(saved);
    await db.meta.put({ key: "workouts_cached_at", value: new Date().toISOString(), updatedAt: Date.now() });
    check();
    return db.workouts.where("user_id").equals(owner).toArray();
  });
}
