import { create } from "zustand";

import type { Exercise, LocalSetDraft, Workout, WorkoutPlan } from "@/types/workout";

type WorkoutState = {
  catalog: Exercise[];
  activeWorkout: Workout | null;
  clientWorkoutId: string | null;
  serverWorkoutId: string | null;
  drafts: LocalSetDraft[];
  currentExerciseIndex: number;
  restSecondsLeft: number;
  isResting: boolean;
  setCatalog: (items: Exercise[]) => void;
  setActiveWorkout: (workout: Workout | null) => void;
  setDrafts: (drafts: LocalSetDraft[]) => void;
  setCurrentExerciseIndex: (index: number) => void;
  nextExercise: () => void;
  prevExercise: () => void;
  setIdMapping: (clientId: string, serverId: string | null) => void;
  remapWorkoutId: (serverId: string) => void;
  hydrateSession: (input: {
    clientId: string;
    serverId: string | null;
    workout: Workout;
    drafts: LocalSetDraft[];
    currentExerciseIndex?: number;
  }) => void;
  updateDraft: (exerciseId: string, setNumber: number, patch: Partial<LocalSetDraft>) => void;
  addDraftSet: (exerciseId: string, template?: Partial<LocalSetDraft>) => void;
  removeDraftSet: (exerciseId: string, setNumber: number) => void;
  startRest: (seconds: number) => void;
  /** Add/subtract seconds while timer is running (clamped). */
  adjustRest: (deltaSeconds: number) => void;
  tickRest: () => void;
  stopRest: () => void;
  /** Set rest duration for all incomplete sets of an exercise. */
  setExerciseRest: (exerciseId: string, restTimeSec: number) => void;
  /**
   * Replace one exercise with another in the active session (drafts + plan).
   * Preserves set data. Tracks original_exercise_id for restore.
   */
  replaceExercise: (fromExerciseId: string, toExercise: Exercise) => boolean;
  /** Restore all session replacements back to original program exercises. */
  restoreDefaultExercises: (catalog?: Exercise[]) => boolean;
  resetSession: () => void;
};

function clampIndex(index: number, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.max(0, Math.min(index, maxExclusive - 1));
}

export function uniqueExerciseIds(drafts: LocalSetDraft[]): string[] {
  const ids: string[] = [];
  for (const d of drafts) {
    if (!ids.includes(d.exerciseId)) ids.push(d.exerciseId);
  }
  return ids;
}

/** Prefer plan order; fall back to drafts (empty drafts must not block navigation). */
export function sessionExerciseIds(
  workout: Workout | null | undefined,
  drafts: LocalSetDraft[],
): string[] {
  const plan = asMutablePlan(workout?.plan);
  if (plan.exercises.length) {
    return [...plan.exercises]
      .sort((a, b) => a.order - b.order)
      .map((item) => item.exercise_id)
      .filter(Boolean);
  }
  return uniqueExerciseIds(drafts);
}

function asMutablePlan(raw: Workout["plan"] | null | undefined): WorkoutPlan {
  if (!raw || typeof raw !== "object") return { exercises: [] };
  const plan = raw as WorkoutPlan;
  return {
    ...plan,
    exercises: Array.isArray(plan.exercises)
      ? plan.exercises.map((e) => ({ ...e }))
      : [],
  };
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  catalog: [],
  activeWorkout: null,
  clientWorkoutId: null,
  serverWorkoutId: null,
  drafts: [],
  currentExerciseIndex: 0,
  restSecondsLeft: 0,
  isResting: false,
  setCatalog: (catalog) => set({ catalog }),
  setActiveWorkout: (activeWorkout) => set({ activeWorkout }),
  setDrafts: (drafts) => set({ drafts }),
  setCurrentExerciseIndex: (index) => {
    const state = get();
    const ids = sessionExerciseIds(state.activeWorkout, state.drafts);
    set({ currentExerciseIndex: clampIndex(index, ids.length) });
  },
  nextExercise: () => {
    const state = get();
    const ids = sessionExerciseIds(state.activeWorkout, state.drafts);
    set({ currentExerciseIndex: clampIndex(state.currentExerciseIndex + 1, ids.length) });
  },
  prevExercise: () => {
    const state = get();
    const ids = sessionExerciseIds(state.activeWorkout, state.drafts);
    set({ currentExerciseIndex: clampIndex(state.currentExerciseIndex - 1, ids.length) });
  },
  setIdMapping: (clientId, serverId) => set({ clientWorkoutId: clientId, serverWorkoutId: serverId }),
  remapWorkoutId: (serverId) => {
    const state = get();
    const clientId = state.clientWorkoutId ?? state.activeWorkout?.id ?? serverId;
    const workout = state.activeWorkout ? { ...state.activeWorkout, id: serverId } : null;
    set({ clientWorkoutId: clientId, serverWorkoutId: serverId, activeWorkout: workout });
  },
  hydrateSession: ({ clientId, serverId, workout, drafts, currentExerciseIndex }) =>
    set({
      clientWorkoutId: clientId,
      serverWorkoutId: serverId,
      activeWorkout: workout,
      drafts,
      currentExerciseIndex: clampIndex(
        currentExerciseIndex ?? 0,
        sessionExerciseIds(workout, drafts).length,
      ),
      isResting: false,
      restSecondsLeft: 0,
    }),
  updateDraft: (exerciseId, setNumber, patch) =>
    set({
      drafts: get().drafts.map((draft) =>
        draft.exerciseId === exerciseId && draft.setNumber === setNumber ? { ...draft, ...patch } : draft,
      ),
    }),
  addDraftSet: (exerciseId, template) => {
    const existing = get().drafts.filter((d) => d.exerciseId === exerciseId);
    const nextNumber = existing.reduce((max, d) => Math.max(max, d.setNumber), 0) + 1;
    const last = existing[existing.length - 1];
    const draft: LocalSetDraft = {
      exerciseId,
      setNumber: nextNumber,
      reps: template?.reps ?? last?.reps ?? "",
      weight: template?.weight ?? last?.weight ?? "",
      isCompleted: false,
      restTimeSec: template?.restTimeSec ?? last?.restTimeSec ?? 60,
      durationSec: template?.durationSec ?? last?.durationSec ?? null,
      note: template?.note ?? null,
      machineParams: template?.machineParams ?? last?.machineParams ?? null,
    };
    set({ drafts: [...get().drafts, draft] });
  },
  removeDraftSet: (exerciseId, setNumber) => {
    const filtered = get().drafts.filter(
      (d) => !(d.exerciseId === exerciseId && d.setNumber === setNumber && !d.isCompleted),
    );
    let n = 1;
    const renumbered = filtered.map((d) => {
      if (d.exerciseId !== exerciseId) return d;
      const next = { ...d, setNumber: n };
      n += 1;
      return next;
    });
    set({ drafts: renumbered });
  },
  startRest: (seconds) =>
    set({
      isResting: true,
      restSecondsLeft: Math.max(0, Math.round(seconds)),
    }),
  adjustRest: (deltaSeconds) => {
    const state = get();
    if (!state.isResting) return;
    const next = Math.max(0, Math.min(600, state.restSecondsLeft + Math.round(deltaSeconds)));
    if (next <= 0) {
      set({ isResting: false, restSecondsLeft: 0 });
      return;
    }
    set({ restSecondsLeft: next });
  },
  tickRest: () => {
    const left = get().restSecondsLeft;
    if (left <= 1) {
      set({ isResting: false, restSecondsLeft: 0 });
      return;
    }
    set({ restSecondsLeft: left - 1 });
  },
  stopRest: () => set({ isResting: false, restSecondsLeft: 0 }),
  setExerciseRest: (exerciseId, restTimeSec) => {
    const sec = Math.max(0, Math.min(600, Math.round(restTimeSec)));
    set({
      drafts: get().drafts.map((d) =>
        d.exerciseId === exerciseId && !d.isCompleted ? { ...d, restTimeSec: sec } : d,
      ),
    });
  },
  replaceExercise: (fromExerciseId, toExercise) => {
    if (!fromExerciseId || !toExercise?.id || fromExerciseId === toExercise.id) return false;
    const state = get();
    if (!state.activeWorkout) return false;

    const plan = asMutablePlan(state.activeWorkout.plan);
    const occupied = new Set(
      (plan.exercises.length
        ? plan.exercises.map((e) => e.exercise_id)
        : uniqueExerciseIds(state.drafts)
      ).filter((id) => id !== fromExerciseId),
    );
    if (occupied.has(toExercise.id)) return false;

    const nextDrafts = state.drafts.map((d) =>
      d.exerciseId === fromExerciseId ? { ...d, exerciseId: toExercise.id } : d,
    );

    let nextPlan = plan;
    if (plan.exercises.length) {
      nextPlan = {
        ...plan,
        exercises: plan.exercises.map((e) => {
          if (e.exercise_id !== fromExerciseId) return e;
          const original = e.original_exercise_id || e.exercise_id;
          return {
            ...e,
            exercise_id: toExercise.id,
            name_ru: toExercise.name_ru,
            original_exercise_id: original,
          };
        }),
      };
    } else {
      const ids = uniqueExerciseIds(nextDrafts);
      nextPlan = {
        title: state.activeWorkout.title ?? null,
        workout_type: state.activeWorkout.workout_type ?? null,
        exercises: ids.map((id, idx) => {
          const sample = nextDrafts.find((d) => d.exerciseId === id);
          const isNew = id === toExercise.id;
          return {
            exercise_id: id,
            order: idx + 1,
            target_sets: nextDrafts.filter((d) => d.exerciseId === id).length || 3,
            target_reps: sample?.reps || null,
            rest_sec: sample?.restTimeSec ?? 60,
            name_ru: isNew
              ? toExercise.name_ru
              : state.catalog.find((c) => c.id === id)?.name_ru ?? null,
            original_exercise_id: isNew ? fromExerciseId : null,
          };
        }),
      };
    }

    const nextWorkout: Workout = {
      ...state.activeWorkout,
      plan: nextPlan,
      sets: (state.activeWorkout.sets || []).map((setRow) =>
        setRow.exercise_id === fromExerciseId
          ? { ...setRow, exercise_id: toExercise.id }
          : setRow,
      ),
    };

    const ids = nextPlan.exercises.length
      ? [...nextPlan.exercises].sort((a, b) => a.order - b.order).map((e) => e.exercise_id)
      : uniqueExerciseIds(nextDrafts);
    const idx = ids.indexOf(toExercise.id);
    set({
      activeWorkout: nextWorkout,
      drafts: nextDrafts,
      currentExerciseIndex: idx >= 0 ? idx : state.currentExerciseIndex,
    });
    return true;
  },
  restoreDefaultExercises: (catalog) => {
    const state = get();
    if (!state.activeWorkout) return false;
    const plan = asMutablePlan(state.activeWorkout.plan);
    if (
      !plan.exercises.some(
        (e) => e.original_exercise_id && e.original_exercise_id !== e.exercise_id,
      )
    ) {
      return false;
    }

    const cat = catalog?.length ? catalog : state.catalog;
    const nameOf = (id: string) => cat.find((c) => c.id === id)?.name_ru ?? null;

    const idMap = new Map<string, string>();
    const nextExercises = plan.exercises.map((e) => {
      const orig = e.original_exercise_id;
      if (!orig || orig === e.exercise_id) {
        return { ...e, original_exercise_id: null };
      }
      idMap.set(e.exercise_id, orig);
      return {
        ...e,
        exercise_id: orig,
        name_ru: nameOf(orig) ?? e.name_ru ?? null,
        original_exercise_id: null,
      };
    });

    if (!idMap.size) return false;

    const nextDrafts = state.drafts.map((d) => {
      const orig = idMap.get(d.exerciseId);
      return orig ? { ...d, exerciseId: orig } : d;
    });

    const nextWorkout: Workout = {
      ...state.activeWorkout,
      plan: { ...plan, exercises: nextExercises },
      sets: (state.activeWorkout.sets || []).map((setRow) => {
        const orig = idMap.get(setRow.exercise_id);
        return orig ? { ...setRow, exercise_id: orig } : setRow;
      }),
    };

    const ids = [...nextExercises].sort((a, b) => a.order - b.order).map((e) => e.exercise_id);
    set({
      activeWorkout: nextWorkout,
      drafts: nextDrafts,
      currentExerciseIndex: clampIndex(state.currentExerciseIndex, ids.length),
    });
    return true;
  },
  resetSession: () =>
    set({
      activeWorkout: null,
      clientWorkoutId: null,
      serverWorkoutId: null,
      drafts: [],
      currentExerciseIndex: 0,
      isResting: false,
      restSecondsLeft: 0,
    }),
}));
