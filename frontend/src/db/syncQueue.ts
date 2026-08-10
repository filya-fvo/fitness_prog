/**
 * Background sync queue — Sprint 3+.
 * Flushes offline workout mutations when the network is back.
 * Keeps clientWorkoutId stable and remaps server ids into the live store.
 */
import { addWorkoutSet, completeWorkout, createWorkout } from "@/api/workouts";
import { db, type SyncQueueItem } from "@/db/schema";
import { useWorkoutStore } from "@/store/workoutStore";
import type { LocalSetDraft, Workout } from "@/types/workout";

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
  item: Omit<SyncQueueItem, "id" | "createdAt" | "attempts" | "lastError">,
): Promise<void> {
  await db.syncQueue.add({
    id: newId(),
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    ...item,
  });
}

const MAX_SYNC_ATTEMPTS = 5;

export async function getPendingCount(): Promise<number> {
  return db.syncQueue.count();
}

/** Drop poison-pill items that failed too many times (unblocks the queue). */
export async function dropFailedSyncItems(maxAttempts = MAX_SYNC_ATTEMPTS): Promise<number> {
  const items = await db.syncQueue.toArray();
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
  const n = await db.syncQueue.count();
  await db.syncQueue.clear();
  return n;
}

export async function peekSyncQueue(): Promise<
  Array<{ id: string; type: string; attempts: number; lastError: string | null }>
> {
  const items = await db.syncQueue.orderBy("createdAt").toArray();
  return items.map((i) => ({
    id: i.id,
    type: i.type,
    attempts: i.attempts,
    lastError: i.lastError,
  }));
}

export async function resolveServerWorkoutId(clientWorkoutId: string): Promise<string> {
  const mapped = await db.workoutIdMap.get(clientWorkoutId);
  if (mapped?.serverId) {
    return mapped.serverId;
  }
  return clientWorkoutId;
}

export async function rememberWorkoutId(clientId: string, serverId: string): Promise<void> {
  await db.workoutIdMap.put({ clientId, serverId, updatedAt: Date.now() });
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

export async function readCachedWorkouts(): Promise<Workout[]> {
  return db.workouts.toArray();
}

export async function saveLocalSession(input: {
  clientId: string;
  serverId: string | null;
  workout: Workout;
  drafts: LocalSetDraft[];
  currentExerciseIndex?: number;
}): Promise<void> {
  const workoutForStore: Workout = {
    ...input.workout,
    id: input.serverId ?? input.workout.id,
  };
  await db.sessions.put({
    clientId: input.clientId,
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

export async function readLocalSession(clientId: string) {
  return db.sessions.get(clientId);
}

export async function deleteLocalSession(clientId: string): Promise<void> {
  await db.sessions.delete(clientId);
}

let flushing = false;

export async function flushSyncQueue(): Promise<{ processed: number; failed: number; dropped: number }> {
  if (flushing || !navigator.onLine) {
    return { processed: 0, failed: 0, dropped: 0 };
  }
  flushing = true;
  let processed = 0;
  let failed = 0;
  let dropped = 0;

  try {
    // Unblock queue if old poison items are stuck
    dropped = await dropFailedSyncItems(MAX_SYNC_ATTEMPTS);

    const items = await db.syncQueue.orderBy("createdAt").toArray();
    for (const item of items) {
      try {
        await processQueueItem(item);
        await db.syncQueue.delete(item.id);
        processed += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : "sync failed";
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= MAX_SYNC_ATTEMPTS) {
          // Drop permanently failing op so the rest of the queue can proceed
          await db.syncQueue.delete(item.id);
          dropped += 1;
          continue;
        }
        await db.syncQueue.update(item.id, {
          attempts,
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

async function processQueueItem(item: SyncQueueItem): Promise<void> {
  if (item.type === "create_workout") {
    const payload = item.payload as {
      scheduledDate: string;
      exerciseIds: string[];
      programId?: string | null;
    };
    const workout = await createWorkout({
      scheduledDate: payload.scheduledDate,
      exerciseIds: payload.exerciseIds,
      programId: payload.programId ?? null,
    });
    await rememberWorkoutId(item.clientWorkoutId, workout.id);
    const session = await db.sessions.get(item.clientWorkoutId);
    if (session) {
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

  const serverWorkoutId = await resolveServerWorkoutId(item.clientWorkoutId);

  if (item.type === "add_set") {
    const payload = item.payload as {
      exerciseId: string;
      setNumber: number;
      reps?: number | null;
      weight?: number | null;
      restTimeSec?: number | null;
      isCompleted?: boolean;
    };
    await addWorkoutSet({
      workoutId: serverWorkoutId,
      exerciseId: payload.exerciseId,
      setNumber: payload.setNumber,
      reps: payload.reps ?? null,
      weight: payload.weight ?? null,
      restTimeSec: payload.restTimeSec ?? null,
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
    if (session) {
      await saveLocalSession({
        clientId: item.clientWorkoutId,
        serverId: serverWorkoutId,
        workout,
        drafts: session.drafts,
      });
    }
  }
}

export function startSyncListeners(): () => void {
  const onOnline = () => {
    void flushSyncQueue();
  };
  window.addEventListener("online", onOnline);
  void flushSyncQueue();
  // Periodic background flush while app is open (covers "online but queue stuck")
  const timer = window.setInterval(() => {
    if (navigator.onLine) void flushSyncQueue();
  }, 20_000);
  return () => {
    window.removeEventListener("online", onOnline);
    window.clearInterval(timer);
  };
}
