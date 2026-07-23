/**
 * Restore in-progress workout session from Dexie after reload.
 */
import { db, type LocalWorkoutSession } from "@/db/schema";
import { readCachedExercises } from "@/db/syncQueue";
import { useWorkoutStore } from "@/store/workoutStore";

export async function findResumableSession(): Promise<LocalWorkoutSession | null> {
  const sessions = await db.sessions.orderBy("updatedAt").reverse().toArray();
  return (
    sessions.find(
      (s) => s.workout.status !== "completed" && s.workout.status !== "skipped",
    ) ?? null
  );
}

export async function restoreSessionIntoStore(
  session: LocalWorkoutSession,
): Promise<void> {
  const store = useWorkoutStore.getState();
  if (!store.catalog.length) {
    const cached = await readCachedExercises();
    if (cached.length) {
      store.setCatalog(cached);
    }
  }
  store.hydrateSession({
    clientId: session.clientId,
    serverId: session.serverId,
    workout: session.workout,
    drafts: session.drafts,
    currentExerciseIndex: session.currentExerciseIndex ?? 0,
  });
}

export async function clearSession(clientId: string): Promise<void> {
  await db.sessions.delete(clientId);
}
