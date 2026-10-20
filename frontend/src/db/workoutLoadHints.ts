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
  if (!ownerUserId || !exerciseIds.length || currentOwnerId() !== ownerUserId) return new Map();
  const wanted = new Set(exerciseIds);
  const rows = await db.workoutLoadHints.where("ownerUserId").equals(ownerUserId).toArray();
  if (currentOwnerId() !== ownerUserId) return new Map();
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
  if (!ownerUserId || currentOwnerId() !== ownerUserId) return;
  const updatedAt = Date.now();
  await db.transaction("rw", db.workoutLoadHints, async () => {
    if (currentOwnerId() !== ownerUserId) throw new Error("Аккаунт изменился");
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
    if (currentOwnerId() !== ownerUserId) throw new Error("Аккаунт изменился");
  });
}

export async function loadExerciseHints(
  exerciseIds: string[],
): Promise<Map<string, ExerciseHistoryBest>> {
  const owner = currentOwnerId();
  const uniqueIds = [...new Set(exerciseIds)].slice(0, 100);
  const cached = await readCachedLoadHints(uniqueIds, owner);
  if (currentOwnerId() !== owner) return new Map();
  if (!uniqueIds.length || !isOnline() || !getStoredToken()) return cached;
  try {
    const fresh = await fetchWorkoutLoadHints(uniqueIds);
    if (currentOwnerId() !== owner) return new Map();
    await cacheLoadHints(fresh, owner, uniqueIds);
    if (currentOwnerId() !== owner) return new Map();
    return new Map(fresh.map((hint) => [hint.exerciseId, hint]));
  } catch {
    return currentOwnerId() === owner ? cached : new Map();
  }
}

export async function cacheCompletedDraftHints(
  drafts: LocalSetDraft[],
  completedAt: string,
  rpe: number | null,
  phase: "light" | "medium" | "heavy" | null = null,
): Promise<void> {
  const owner = currentOwnerId();
  const best = new Map<string, WorkoutLoadHint>();
  for (const draft of drafts) {
    if (!draft.isCompleted) continue;
    if (draft.executionKind === "drop" || draft.executionKind === "cluster") continue;
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
  const hints = [...best.values()];
  if (phase && hints.length) {
    const cached = await readCachedLoadHints(hints.map((hint) => hint.exerciseId), owner);
    if (currentOwnerId() !== owner) return;
    for (const hint of hints) {
      hint.phaseLoads = {
        ...cached.get(hint.exerciseId)?.phaseLoads,
        [phase]: {
          weight: hint.lastWeight,
          reps: hint.lastReps,
          date: hint.lastDate,
          durationSec: hint.lastDurationSec,
          weightMode: hint.lastWeightMode,
          machineParams: hint.lastMachineParams,
          rpe: hint.lastRpe,
        },
      };
    }
  }
  await cacheLoadHints(hints, owner);
}
