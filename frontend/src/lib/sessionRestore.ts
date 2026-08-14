/**
 * Restore in-progress workout session from Dexie after reload.
 */
import { db, type LocalWorkoutSession } from "@/db/schema";
import { readCachedExercises } from "@/db/syncQueue";
import { sessionBelongsToUser } from "@/db/userScope";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";

export async function findResumableSession(
  ownerUserId = useUserStore.getState().user?.id,
): Promise<LocalWorkoutSession | null> {
  if (!ownerUserId) return null;
  const sessions = await db.sessions.where("ownerUserId").equals(ownerUserId).toArray();
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    sessions.find(
      (s) => s.workout.status !== "completed" && s.workout.status !== "skipped",
    ) ?? null
  );
}

export async function restoreSessionIntoStore(
  session: LocalWorkoutSession,
  ownerUserId = useUserStore.getState().user?.id,
): Promise<void> {
  if (!ownerUserId) throw new Error("Cannot restore a workout before authentication");
  if (!sessionBelongsToUser(session, ownerUserId)) {
    throw new Error("Refusing to restore another user's workout session");
  }
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
