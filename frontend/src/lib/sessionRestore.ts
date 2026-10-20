/**
 * Restore in-progress workout session from Dexie after reload.
 */
import { db, type LocalWorkoutSession } from "@/db/schema";
import { readCachedExercises } from "@/db/syncQueue";
import { sessionBelongsToUser } from "@/db/userScope";
import { useUserStore } from "@/store/userStore";
import { initializeExecutionSession } from "@/db/workoutExecution";
import { workoutClockSnapshot } from "@/utils/workoutRest";
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

let restoreRequest = 0;

export async function restoreSessionIntoStore(
  session: LocalWorkoutSession,
  ownerUserId = useUserStore.getState().user?.id,
): Promise<void> {
  if (!ownerUserId) throw new Error("Cannot restore a workout before authentication");
  if (!sessionBelongsToUser(session, ownerUserId)) {
    throw new Error("Refusing to restore another user's workout session");
  }
  const request = ++restoreRequest;
  const check = () => {
    if (request !== restoreRequest || useUserStore.getState().user?.id !== ownerUserId) throw new Error("Аккаунт или тренировка изменились. Откройте тренировку снова");
  };
  check();
  const version = (session.workout.plan as { execution_version?: unknown } | null)?.execution_version;
  if (version != null && version !== 1 && version !== 2) throw new Error("Обновите приложение, чтобы открыть сохранённую тренировку. Данные сохранены");
  const cached = useWorkoutStore.getState().catalog.length ? [] : await readCachedExercises();
  check();
  const restored = version === 2 ? await initializeExecutionSession({ owner: ownerUserId, clientWorkoutId: session.clientId,
    serverWorkoutId: session.serverId, workout: session.workout, drafts: session.drafts, now: workoutClockSnapshot() }) : session;
  check();
  const store = useWorkoutStore.getState();
  if (cached.length) store.setCatalog(cached);
  store.hydrateSession({ clientId: restored.clientId, serverId: restored.serverId, workout: restored.workout, drafts: restored.drafts,
    currentExerciseIndex: restored.currentExerciseIndex ?? 0, execution: restored.execution });

}

export async function clearSession(clientId: string): Promise<void> {
  await db.sessions.delete(clientId);
}
