import { getStoredToken } from "@/api/client";
import { fetchWorkoutLoadHints } from "@/api/workouts";
import { db } from "@/db/schema";
import { useUserStore } from "@/store/userStore";
import type { WorkoutLoadHint } from "@/types/workout";
import type { LocalSetDraft } from "@/types/workout";
import type { ExerciseHistoryBest } from "@/utils/loadProgression";
import { isOnline } from "@/utils/network";

function currentOwnerId(): string | null {
  return useUserStore.getState().user?.id ?? null;
}

function key(ownerUserId: string, exerciseId: string): string {
  return `${ownerUserId}:${exerciseId}`;
}

export async function readCachedLoadHints(
  exerciseIds: string[],
  ownerUserId = currentOwnerId(),
): Promise<Map<string, ExerciseHistoryBest>> {
  if (!ownerUserId || !exerciseIds.length) return new Map();
  const wanted = new Set(exerciseIds);
  const rows = await db.workoutLoadHints.where("ownerUserId").equals(ownerUserId).toArray();
  return new Map(
    rows
      .filter((row) => wanted.has(row.exerciseId))
      .map((row) => [row.exerciseId, row]),
  );
}

export async function cacheLoadHints(
  hints: WorkoutLoadHint[],
  ownerUserId = currentOwnerId(),
  requestedExerciseIds: string[] = hints.map((hint) => hint.exerciseId),
): Promise<void> {
  if (!ownerUserId) return;
  const updatedAt = Date.now();
  await db.transaction("rw", db.workoutLoadHints, async () => {
    if (requestedExerciseIds.length) {
      await db.workoutLoadHints.bulkDelete(
        requestedExerciseIds.map((exerciseId) => key(ownerUserId, exerciseId)),
      );
    }
    if (hints.length) {
      await db.workoutLoadHints.bulkPut(hints.map((hint) => ({
        ...hint,
        key: key(ownerUserId, hint.exerciseId),
        ownerUserId,
        updatedAt,
      })));
    }
  });
}

export async function loadExerciseHints(
  exerciseIds: string[],
): Promise<Map<string, ExerciseHistoryBest>> {
  const uniqueIds = [...new Set(exerciseIds)].slice(0, 100);
  const cached = await readCachedLoadHints(uniqueIds);
  if (!uniqueIds.length || !isOnline() || !getStoredToken()) return cached;
  try {
    const fresh = await fetchWorkoutLoadHints(uniqueIds);
    await cacheLoadHints(fresh, currentOwnerId(), uniqueIds);
    return new Map(fresh.map((hint) => [hint.exerciseId, hint]));
  } catch {
    return cached;
  }
}

export async function cacheCompletedDraftHints(
  drafts: LocalSetDraft[],
  completedAt: string,
  rpe: number | null,
): Promise<void> {
  const best = new Map<string, WorkoutLoadHint>();
  for (const draft of drafts) {
    if (!draft.isCompleted) continue;
    const weight = Number(draft.weight) || 0;
    const reps = Number(draft.reps) || 0;
    const duration = Number(draft.durationSec) || 0;
    if (weight <= 0 && reps <= 0 && duration <= 0 && !draft.machineParams) continue;
    const current = best.get(draft.exerciseId);
    if (
      current
      && (current.lastWeight > weight
        || (current.lastWeight === weight && current.lastReps > reps)
        || (current.lastWeight === weight && current.lastReps === reps
          && (current.lastDurationSec || 0) >= duration))
    ) continue;
    best.set(draft.exerciseId, {
      exerciseId: draft.exerciseId,
      lastWeight: weight,
      lastReps: reps,
      lastDate: completedAt.slice(0, 10),
      lastDurationSec: duration || null,
      lastWeightMode: draft.weightMode ?? null,
      lastMachineParams: draft.machineParams ?? null,
      lastRpe: rpe,
    });
  }
  await cacheLoadHints([...best.values()]);
}
