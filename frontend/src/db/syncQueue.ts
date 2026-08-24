/**
 * Background sync queue — Sprint 3+.
 * Flushes offline workout mutations when the network is back.
 * Keeps clientWorkoutId stable and remaps server ids into the live store.
 */
import { addWorkoutSet, completeWorkout, createWorkout, deleteWorkout, updateWorkoutPlan } from "@/api/workouts";
import { updateMyProfile } from "@/api/users";
import {
  mergeProfileUpdates,
  type ProfileUpdatePayload,
} from "@/db/profileUpdate";
import { db, type SyncQueueItem } from "@/db/schema";
import { syncItemBelongsToUser, workoutsForUser } from "@/db/userScope";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { LocalSetDraft, Workout, WorkoutPlan } from "@/types/workout";

function newId(): string {
  return crypto.randomUUID();
}

type IdRemapListener = (clientId: string, serverId: string) => void;
const remapListeners = new Set<IdRemapListener>();

export function onWorkoutIdRemap(listener: IdRemapListener): () => void {
  remapListeners.add(listener);
  return () => remapListeners.delete(listener);
}

function notifyRemap(clientId: string, serverId: string): void {
  const state = useWorkoutStore.getState();
  if (state.clientWorkoutId === clientId || state.activeWorkout?.id === clientId) {
    state.remapWorkoutId(serverId);
  }
  for (const listener of remapListeners) {
    listener(clientId, serverId);
  }
}

export async function enqueueSync(
  item: Omit<
    SyncQueueItem,
    "id" | "ownerUserId" | "createdAt" | "attempts" | "lastError"
  > & { ownerUserId?: string },
): Promise<void> {
  const ownerUserId = requireOwnerUserId(item.ownerUserId);
  await db.syncQueue.add({
    ...item,
    id: newId(),
    ownerUserId,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  });
}

const MAX_SYNC_ATTEMPTS = 5;

function currentOwnerUserId(): string | null {
  return (
    useUserStore.getState().user?.id ??
    useWorkoutStore.getState().activeWorkout?.user_id ??
    null
  );
}

function requireOwnerUserId(explicit?: string | null): string {
  const ownerUserId = explicit || currentOwnerUserId();
  if (!ownerUserId) throw new Error("Cannot persist offline data without an authenticated user");
  return ownerUserId;
}

function profileDraftKey(ownerUserId: string): string {
  return `fitness_profile_draft_v2:${ownerUserId}`;
}

export async function getPendingCount(ownerUserId?: string): Promise<number> {
  const owner = ownerUserId || currentOwnerUserId();
  if (!owner) return 0;
  return db.syncQueue.where("ownerUserId").equals(owner).count();
}

/** Explicit recovery action. Never call automatically: queued workout data belongs to the user. */
export async function dropFailedSyncItems(maxAttempts = MAX_SYNC_ATTEMPTS): Promise<number> {
  const owner = currentOwnerUserId();
  if (!owner) return 0;
  const items = await db.syncQueue.where("ownerUserId").equals(owner).toArray();
  let removed = 0;
  for (const item of items) {
    if ((item.attempts || 0) >= maxAttempts) {
      await db.syncQueue.delete(item.id);
      removed += 1;
    }
  }
  return removed;
}

export async function clearSyncQueue(): Promise<number> {
  const owner = currentOwnerUserId();
  if (!owner) return 0;
  const keys = await db.syncQueue.where("ownerUserId").equals(owner).primaryKeys();
  const n = keys.length;
  await db.syncQueue.bulkDelete(keys);
  localStorage.removeItem(profileDraftKey(owner));
  return n;
}

/** Clear all local workout state after an explicit admin reset of the current user. */
export async function clearLocalWorkoutData(): Promise<void> {
  const owner = requireOwnerUserId();
  await db.transaction(
    "rw",
    db.workouts,
    db.sessions,
    db.syncQueue,
    db.workoutIdMap,
    db.meta,
    async () => {
      await Promise.all([
        db.workouts.where("user_id").equals(owner).delete(),
        db.sessions.where("ownerUserId").equals(owner).delete(),
        db.syncQueue.where("ownerUserId").equals(owner).delete(),
        db.workoutIdMap.where("ownerUserId").equals(owner).delete(),
        db.meta.delete("workouts_cached_at"),
      ]);
    },
  );
  localStorage.removeItem(profileDraftKey(owner));
  useWorkoutStore.getState().resetSession();
}

export async function peekSyncQueue(): Promise<
  Array<{ id: string; type: string; attempts: number; lastError: string | null }>
> {
  const owner = currentOwnerUserId();
  if (!owner) return [];
  const items = await db.syncQueue.where("ownerUserId").equals(owner).sortBy("createdAt");
  return items.map((i) => ({
    id: i.id,
    type: i.type,
    attempts: i.attempts,
    lastError: i.lastError,
  }));
}

export async function resolveServerWorkoutId(
  clientWorkoutId: string,
  ownerUserId?: string,
): Promise<string> {
  const owner = requireOwnerUserId(ownerUserId);
  const mapped = await db.workoutIdMap.get(clientWorkoutId);
  if (mapped?.serverId && mapped.ownerUserId === owner) {
    return mapped.serverId;
  }
  return clientWorkoutId;
}

export async function rememberWorkoutId(
  clientId: string,
  serverId: string,
  ownerUserId?: string,
): Promise<void> {
  const owner = requireOwnerUserId(ownerUserId);
  await db.workoutIdMap.put({
    clientId,
    ownerUserId: owner,
    serverId,
    updatedAt: Date.now(),
  });
  if (clientId !== serverId) {
    notifyRemap(clientId, serverId);
  }
}

export async function cacheExercises(items: import("@/types/workout").Exercise[]): Promise<void> {
  await db.transaction("rw", db.exercises, db.meta, async () => {
    await db.exercises.clear();
    if (items.length) {
      await db.exercises.bulkPut(items);
    }
    await db.meta.put({
      key: "exercises_cached_at",
      value: new Date().toISOString(),
      updatedAt: Date.now(),
    });
  });
}

export async function readCachedExercises(): Promise<import("@/types/workout").Exercise[]> {
  return db.exercises.toArray();
}

export async function cacheWorkouts(items: Workout[]): Promise<void> {
  await db.transaction("rw", db.workouts, db.meta, async () => {
    const ownerIds = [...new Set(items.map((item) => item.user_id))];
    const currentOwner = currentOwnerUserId();
    if (!ownerIds.length && currentOwner) ownerIds.push(currentOwner);
    for (const ownerId of ownerIds) {
      await db.workouts.where("user_id").equals(ownerId).delete();
    }
    for (const item of items) {
      await db.workouts.put(item);
    }
    await db.meta.put({
      key: "workouts_cached_at",
      value: new Date().toISOString(),
      updatedAt: Date.now(),
    });
  });
}

export async function readCachedWorkouts(ownerUserId?: string): Promise<Workout[]> {
  const owner = ownerUserId || currentOwnerUserId();
  if (!owner) return [];
  return workoutsForUser(await db.workouts.where("user_id").equals(owner).toArray(), owner);
}

export async function cacheWorkout(item: Workout): Promise<void> {
  await db.workouts.put(item);
}

export async function removeCachedWorkout(workoutId: string): Promise<void> {
  await db.workouts.delete(workoutId);
}

export async function saveLocalSession(input: {
  clientId: string;
  serverId: string | null;
  workout: Workout;
  drafts: LocalSetDraft[];
  currentExerciseIndex?: number;
}): Promise<void> {
  const ownerUserId = requireOwnerUserId(input.workout.user_id);
  const workoutForStore: Workout = {
    ...input.workout,
    id: input.serverId ?? input.workout.id,
  };
  await db.sessions.put({
    clientId: input.clientId,
    ownerUserId,
    serverId: input.serverId,
    workout: workoutForStore,
    drafts: input.drafts,
    currentExerciseIndex: input.currentExerciseIndex ?? 0,
    updatedAt: Date.now(),
  });
  await db.workouts.put(workoutForStore);
  if (input.serverId && input.serverId !== input.clientId) {
    await db.workouts.delete(input.clientId);
  }
}

export async function syncWorkoutPlan(input: {
  clientWorkoutId: string;
  plan: WorkoutPlan;
}): Promise<void> {
  if (navigator.onLine) {
    try {
      const serverWorkoutId = await resolveServerWorkoutId(input.clientWorkoutId);
      await updateWorkoutPlan({ workoutId: serverWorkoutId, plan: input.plan });
      return;
    } catch {
      // Preserve the mutation and retry in queue order (after create_workout if needed).
    }
  }
  await enqueueSync({
    type: "update_plan",
    clientWorkoutId: input.clientWorkoutId,
    payload: { plan: input.plan },
  });
}

export async function readLocalSession(clientId: string, ownerUserId?: string) {
  const owner = ownerUserId || currentOwnerUserId();
  if (!owner) return undefined;
  const session = await db.sessions.get(clientId);
  return session?.ownerUserId === owner ? session : undefined;
}

export async function deleteLocalSession(clientId: string): Promise<void> {
  const session = await readLocalSession(clientId);
  if (session) await db.sessions.delete(clientId);
}

let flushing = false;

export async function flushSyncQueue(
  ownerUserId?: string,
  options: { retryFailed?: boolean } = {},
): Promise<{ processed: number; failed: number; dropped: number }> {
  const owner = ownerUserId || currentOwnerUserId();
  if (!owner) return { processed: 0, failed: 0, dropped: 0 };
  if (flushing || !navigator.onLine) {
    return { processed: 0, failed: 0, dropped: 0 };
  }
  flushing = true;
  let processed = 0;
  let failed = 0;
  let dropped = 0;

  try {
    const items = await db.syncQueue.where("ownerUserId").equals(owner).sortBy("createdAt");
    if (options.retryFailed) {
      const failedIds = items
        .filter((item) => (item.attempts || 0) >= MAX_SYNC_ATTEMPTS)
        .map((item) => item.id);
      if (failedIds.length) {
        await db.syncQueue.bulkUpdate(
          failedIds.map((key) => ({ key, changes: { attempts: 0, lastError: null } })),
        );
        for (const item of items) {
          if (failedIds.includes(item.id)) {
            item.attempts = 0;
            item.lastError = null;
          }
        }
      }
    }
    for (const item of items) {
      if (useUserStore.getState().user?.id !== owner) break;
      if ((item.attempts || 0) >= MAX_SYNC_ATTEMPTS) {
        failed += 1;
        continue;
      }
      try {
        await processQueueItem(item, owner);
        await db.syncQueue.delete(item.id);
        processed += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : "sync failed";
        const attempts = (item.attempts || 0) + 1;
        await db.syncQueue.update(item.id, {
          attempts: Math.min(attempts, MAX_SYNC_ATTEMPTS),
          lastError: message,
        });
        // Don't freeze the whole queue forever on one bad item — try next
        continue;
      }
    }
  } finally {
    flushing = false;
  }

  return { processed, failed, dropped };
}

async function processQueueItem(item: SyncQueueItem, ownerUserId: string): Promise<void> {
  if (
    !syncItemBelongsToUser(item, ownerUserId) ||
    useUserStore.getState().user?.id !== ownerUserId
  ) {
    throw new Error("Authenticated user changed during synchronization");
  }
  if (item.type === "create_workout") {
    const payload = item.payload as {
      scheduledDate: string;
      exerciseIds: string[];
      programId?: string | null;
      title?: string | null;
      workoutType?: string | null;
      setsPerExercise?: number;
      plan?: WorkoutPlan | null;
    };
    const workout = await createWorkout({
      clientWorkoutId: item.clientWorkoutId,
      scheduledDate: payload.scheduledDate,
      exerciseIds: payload.exerciseIds,
      programId: payload.programId ?? null,
      title: payload.title ?? null,
      workoutType: payload.workoutType ?? null,
      setsPerExercise: payload.setsPerExercise ?? 3,
      plan: payload.plan ?? null,
    });
    await rememberWorkoutId(item.clientWorkoutId, workout.id, ownerUserId);
    const session = await db.sessions.get(item.clientWorkoutId);
    if (session?.ownerUserId === ownerUserId) {
      const updated: Workout = {
        ...workout,
        sets: session.workout.sets.map((s) => ({ ...s, workout_id: workout.id })),
      };
      await saveLocalSession({
        clientId: item.clientWorkoutId,
        serverId: workout.id,
        workout: updated,
        drafts: session.drafts,
      });
    }
    return;
  }

  if (item.type === "update_profile") {
    const payload = item.payload as {
      anthropometry?: Record<string, unknown>;
      goals?: Record<string, unknown>;
    };
    await updateMyProfile(payload);
    localStorage.removeItem(profileDraftKey(ownerUserId));
    return;
  }

  const serverWorkoutId = await resolveServerWorkoutId(item.clientWorkoutId, ownerUserId);

  if (item.type === "update_plan") {
    const payload = item.payload as { plan: WorkoutPlan };
    await updateWorkoutPlan({ workoutId: serverWorkoutId, plan: payload.plan });
    return;
  }

  if (item.type === "add_set") {
    const payload = item.payload as {
      exerciseId: string;
      setNumber: number;
      reps?: number | null;
      weight?: number | null;
      weightMode?: "total" | "per_hand" | null;
      restTimeSec?: number | null;
      durationSec?: number | null;
      note?: string | null;
      machineParams?: Record<string, string | number> | null;
      isCompleted?: boolean;
    };
    await addWorkoutSet({
      workoutId: serverWorkoutId,
      exerciseId: payload.exerciseId,
      setNumber: payload.setNumber,
      reps: payload.reps ?? null,
      weight: payload.weight ?? null,
      weightMode: payload.weightMode ?? null,
      restTimeSec: payload.restTimeSec ?? null,
      durationSec: payload.durationSec ?? null,
      note: payload.note ?? null,
      machineParams: payload.machineParams ?? null,
      isCompleted: payload.isCompleted ?? true,
    });
    return;
  }

  if (item.type === "complete_workout") {
    const payload = item.payload as {
      rpe?: number | null;
      aiNotes?: string | null;
    };
    const workout = await completeWorkout({
      workoutId: serverWorkoutId,
      rpe: payload.rpe ?? null,
      aiNotes: payload.aiNotes ?? null,
    });
    await db.workouts.put(workout);
    const session = await db.sessions.get(item.clientWorkoutId);
    if (session?.ownerUserId === ownerUserId) {
      await saveLocalSession({
        clientId: item.clientWorkoutId,
        serverId: serverWorkoutId,
        workout,
        drafts: session.drafts,
      });
    }
    return;
  }

  if (item.type === "delete_workout") {
    await deleteWorkout(serverWorkoutId);
    await db.workouts.delete(serverWorkoutId);
  }
}

export function startSyncListeners(ownerUserId: string): () => void {
  const onOnline = () => {
    void flushSyncQueue(ownerUserId, { retryFailed: true });
  };
  window.addEventListener("online", onOnline);
  // A Funnel/API outage can leave navigator.onLine=true. Opening the app again
  // is an explicit recovery signal, so previously exhausted items get one more cycle.
  void flushSyncQueue(ownerUserId, { retryFailed: true });
  // Periodic background flush while app is open (covers "online but queue stuck")
  const timer = window.setInterval(() => {
    if (navigator.onLine) void flushSyncQueue(ownerUserId);
  }, 20_000);
  return () => {
    window.removeEventListener("online", onOnline);
    window.clearInterval(timer);
  };
}

export async function enqueueProfileUpdate(input: ProfileUpdatePayload): Promise<void> {
  const ownerUserId = requireOwnerUserId();
  const existing = await db.syncQueue
    .where("ownerUserId")
    .equals(ownerUserId)
    .and((item) => item.type === "update_profile")
    .sortBy("createdAt");
  const payload = existing.reduce(
    (merged, item) => mergeProfileUpdates(merged, item.payload as ProfileUpdatePayload),
    {} as ProfileUpdatePayload,
  );
  const mergedPayload = mergeProfileUpdates(payload, input);
  if (existing.length) await db.syncQueue.bulkDelete(existing.map((item) => item.id));
  localStorage.setItem(profileDraftKey(ownerUserId), JSON.stringify(mergedPayload));
  await enqueueSync({
    ownerUserId,
    type: "update_profile",
    clientWorkoutId: `profile:${ownerUserId}`,
    payload: mergedPayload,
  });
}

export async function clearQueuedProfileUpdate(ownerUserId?: string): Promise<void> {
  const owner = requireOwnerUserId(ownerUserId);
  const existing = await db.syncQueue
    .where("ownerUserId")
    .equals(owner)
    .and((item) => item.type === "update_profile")
    .primaryKeys();
  if (existing.length) await db.syncQueue.bulkDelete(existing);
  localStorage.removeItem(profileDraftKey(owner));
}
