import type { LocalSetDraft, Workout, WorkoutPlanExercise, WorkoutSet } from "@/types/workout";

function setKey(exerciseId: string, setNumber: number): string {
  return `${exerciseId}:${setNumber}`;
}

function draftFromSet(row: WorkoutSet, fallbackRestSec = 60): LocalSetDraft {
  return {
    exerciseId: row.exercise_id,
    setNumber: row.set_number,
    reps: row.reps == null ? "" : String(row.reps),
    weight: row.weight == null ? "" : String(row.weight),
    weightMode: row.weight_mode ?? null,
    isCompleted: row.is_completed,
    restTimeSec: row.rest_time_sec ?? fallbackRestSec,
    durationSec: row.duration_sec ?? null,
    note: row.note ?? null,
    machineParams: row.machine_params ?? null,
  };
}

/** Rebuild editable local set slots from a server-side workout snapshot. */
export function draftsFromWorkoutSnapshot(workout: Workout): LocalSetDraft[] {
  const plan = workout.plan && typeof workout.plan === "object" ? workout.plan : null;
  const exercises = Array.isArray((plan as { exercises?: unknown[] } | null)?.exercises)
    ? (((plan as { exercises: WorkoutPlanExercise[] }).exercises || [])
        .filter((item) => Boolean(item?.exercise_id))
        .sort((a, b) => a.order - b.order))
    : [];
  const savedByKey = new Map(
    (workout.sets || []).map((row) => [setKey(row.exercise_id, row.set_number), row]),
  );
  const drafts: LocalSetDraft[] = [];
  const plannedExerciseIds = new Set<string>();

  for (const exercise of exercises) {
    plannedExerciseIds.add(exercise.exercise_id);
    const savedRows = (workout.sets || []).filter(
      (row) => row.exercise_id === exercise.exercise_id,
    );
    const highestSavedSet = savedRows.reduce(
      (highest, row) => Math.max(highest, row.set_number),
      0,
    );
    const plannedSetCount = Math.max(1, Math.min(12, exercise.target_sets || 3));
    const setCount = Math.max(plannedSetCount, highestSavedSet);
    const restSec = exercise.rest_sec ?? 60;

    for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
      const saved = savedByKey.get(setKey(exercise.exercise_id, setNumber));
      drafts.push(
        saved
          ? draftFromSet(saved, restSec)
          : {
              exerciseId: exercise.exercise_id,
              setNumber,
              reps: "",
              weight: "",
              weightMode: exercise.weight_mode ?? null,
              isCompleted: false,
              restTimeSec: restSec,
              durationSec: null,
              note: exercise.note ?? null,
              machineParams: null,
            },
      );
    }
  }

  // Keep legacy/custom sets even if an old snapshot has no matching plan row.
  for (const row of [...(workout.sets || [])].sort(
    (a, b) => a.exercise_id.localeCompare(b.exercise_id) || a.set_number - b.set_number,
  )) {
    if (!plannedExerciseIds.has(row.exercise_id)) {
      drafts.push(draftFromSet(row));
    }
  }

  return drafts;
}

/**
 * A planned exercise is complete once every planned slot is complete.
 * Extra user-added sets must not block the automatic move to the next exercise.
 */
export function isPlannedExerciseComplete(
  drafts: LocalSetDraft[],
  exerciseId: string,
  targetSets?: number | null,
): boolean {
  const exerciseDrafts = drafts.filter((draft) => draft.exerciseId === exerciseId);
  const plannedCount = Number.isFinite(targetSets) ? Math.max(0, Math.trunc(targetSets || 0)) : 0;

  if (plannedCount <= 0) {
    return exerciseDrafts.length > 0 && exerciseDrafts.every((draft) => draft.isCompleted);
  }

  for (let setNumber = 1; setNumber <= plannedCount; setNumber += 1) {
    if (!exerciseDrafts.some((draft) => draft.setNumber === setNumber && draft.isCompleted)) {
      return false;
    }
  }
  return true;
}

/** Return the next unfinished exercise after the current one, respecting plan order. */
export function findNextIncompleteExerciseIndex(
  exerciseIds: string[],
  drafts: LocalSetDraft[],
  currentIndex: number,
  planExercises: Array<Pick<WorkoutPlanExercise, "exercise_id" | "target_sets">> = [],
): number | null {
  const targets = new Map(
    planExercises.map((item) => [item.exercise_id, item.target_sets ?? null]),
  );
  for (let index = Math.max(0, currentIndex + 1); index < exerciseIds.length; index += 1) {
    const exerciseId = exerciseIds[index];
    if (!isPlannedExerciseComplete(drafts, exerciseId, targets.get(exerciseId))) {
      return index;
    }
  }
  return null;
}

/** A completed set starts rest only when there was no timer at submit time. */
export function shouldStartRestAfterSet(input: {
  setWasCompleted: boolean;
  restWasActiveAtSubmit: boolean;
  restIsActiveNow: boolean;
}): boolean {
  return !input.setWasCompleted && !input.restWasActiveAtSubmit && !input.restIsActiveNow;
}

/** Profiles created before this option existed retain automatic exercise switching. */
export function resolveAutoAdvanceSetting(value: unknown, fallback = true): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}
