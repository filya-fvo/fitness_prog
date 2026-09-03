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
  restEndsAtMs: number | null;
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
  syncRest: () => void;
  stopRest: () => void;
  /** Set rest duration for all incomplete sets of an exercise. */
  setExerciseRest: (exerciseId: string, restTimeSec: number) => void;
  /**
   * Replace one exercise with another in the active session (drafts + plan).
   * Preserves set data. Tracks original_exercise_id for restore.
   */
  replaceExercise: (fromExerciseId: string, toExercise: Exercise) => boolean;
  /** Atomically replace several incomplete exercises and keep originals for restore. */
  replaceExercises: (
    replacements: Array<{ fromExerciseId: string; toExercise: Exercise }>,
  ) => number;
  /** Restore all session replacements back to original program exercises. */
  restoreDefaultExercises: (catalog?: Exercise[]) => boolean;
  resetSession: () => void;
};

const REST_TIMER_KEY = "fitness_rest_timer_v1";

function saveRestEnd(endsAtMs: number | null): void {
  try {
    if (endsAtMs) localStorage.setItem(REST_TIMER_KEY, String(endsAtMs));
    else localStorage.removeItem(REST_TIMER_KEY);
  } catch {
    // Storage may be unavailable in a private WebView; in-memory timer still works.
  }
}

function restoredRest(): { isResting: boolean; restSecondsLeft: number; restEndsAtMs: number | null } {
  try {
    const endsAtMs = Number(localStorage.getItem(REST_TIMER_KEY));
    const seconds = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));
    if (endsAtMs > 0 && seconds > 0) return { isResting: true, restSecondsLeft: seconds, restEndsAtMs: endsAtMs };
    saveRestEnd(null);
  } catch {
    // Fall through to an inactive timer.
  }
  return { isResting: false, restSecondsLeft: 0, restEndsAtMs: null };
}

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
  ...restoredRest(),
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
      ...restoredRest(),
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
      weightMode: template?.weightMode ?? last?.weightMode ?? null,
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
    set(() => {
      const value = Math.max(0, Math.round(seconds));
      const endsAtMs = value > 0 ? Date.now() + value * 1000 : null;
      saveRestEnd(endsAtMs);
      return {
        isResting: value > 0,
        restSecondsLeft: value,
        restEndsAtMs: endsAtMs,
      };
    }),
  adjustRest: (deltaSeconds) => {
    const state = get();
    if (!state.isResting) return;
    const liveLeft = state.restEndsAtMs
      ? Math.max(0, Math.ceil((state.restEndsAtMs - Date.now()) / 1000))
      : state.restSecondsLeft;
    const next = Math.max(0, Math.min(600, liveLeft + Math.round(deltaSeconds)));
    if (next <= 0) {
      saveRestEnd(null);
      set({ isResting: false, restSecondsLeft: 0, restEndsAtMs: null });
      return;
    }
    const endsAtMs = Date.now() + next * 1000;
    saveRestEnd(endsAtMs);
    set({ restSecondsLeft: next, restEndsAtMs: endsAtMs });
  },
  syncRest: () => {
    const state = get();
    if (!state.isResting || !state.restEndsAtMs) return;
    const left = Math.max(0, Math.ceil((state.restEndsAtMs - Date.now()) / 1000));
    if (left <= 0) {
      saveRestEnd(null);
      set({ isResting: false, restSecondsLeft: 0, restEndsAtMs: null });
      return;
    }
    if (left !== state.restSecondsLeft) set({ restSecondsLeft: left });
  },
  stopRest: () => {
    saveRestEnd(null);
    set({ isResting: false, restSecondsLeft: 0, restEndsAtMs: null });
  },
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
      d.exerciseId === fromExerciseId && !d.isCompleted
        ? {
            ...d,
            exerciseId: toExercise.id,
            // Load belongs to an exercise, not to its slot in the workout.
            // Empty values are then filled only from the replacement's own history.
            weight: "",
            weightMode: null,
            machineParams: null,
            replacementOriginalWeight: d.replacementOriginalWeight ?? d.weight,
            replacementOriginalMachineParams:
              d.replacementOriginalMachineParams ?? d.machineParams ?? null,
          }
        : d,
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
        setRow.exercise_id === fromExerciseId && !setRow.is_completed
          ? {
              ...setRow,
              exercise_id: toExercise.id,
              weight: null,
              weight_mode: null,
              machine_params: null,
              replacement_original_weight:
                setRow.replacement_original_weight ?? setRow.weight,
              replacement_original_machine_params:
                setRow.replacement_original_machine_params ?? setRow.machine_params ?? null,
            }
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
  replaceExercises: (replacements) => {
    const state = get();
    if (!state.activeWorkout || !replacements.length) return 0;

    const plan = asMutablePlan(state.activeWorkout.plan);
    if (!plan.exercises.length) return 0;

    const completedIds = new Set([
      ...state.drafts.filter((draft) => draft.isCompleted).map((draft) => draft.exerciseId),
      ...(state.activeWorkout.sets || [])
        .filter((setRow) => setRow.is_completed)
        .map((setRow) => setRow.exercise_id),
    ]);
    const planIds = new Set(plan.exercises.map((item) => item.exercise_id));
    const usedTargets = new Set<string>();
    const accepted = new Map<string, Exercise>();

    for (const item of replacements) {
      const fromId = item.fromExerciseId;
      const toId = item.toExercise?.id;
      if (
        !fromId ||
        !toId ||
        fromId === toId ||
        !planIds.has(fromId) ||
        completedIds.has(fromId) ||
        planIds.has(toId) ||
        usedTargets.has(toId)
      ) {
        continue;
      }
      accepted.set(fromId, item.toExercise);
      usedTargets.add(toId);
    }

    if (!accepted.size) return 0;

    const nextExercises = plan.exercises.map((item) => {
      const replacement = accepted.get(item.exercise_id);
      if (!replacement) return item;
      return {
        ...item,
        exercise_id: replacement.id,
        name_ru: replacement.name_ru,
        original_exercise_id: item.original_exercise_id || item.exercise_id,
      };
    });

    const idMap = new Map(
      [...accepted.entries()].map(([fromId, exercise]) => [fromId, exercise.id]),
    );
    const nextDrafts = state.drafts.map((draft) => {
      const nextId = idMap.get(draft.exerciseId);
      if (!nextId) return draft;
      return {
        ...draft,
        exerciseId: nextId,
        // A working weight is exercise-specific and must not be copied in bulk.
        weight: "",
        weightMode: null,
        machineParams: null,
        replacementOriginalWeight: draft.replacementOriginalWeight ?? draft.weight,
        replacementOriginalMachineParams:
          draft.replacementOriginalMachineParams ?? draft.machineParams ?? null,
      };
    });
    const nextWorkout: Workout = {
      ...state.activeWorkout,
      plan: { ...plan, exercises: nextExercises },
      sets: (state.activeWorkout.sets || []).map((setRow) => {
        const nextId = idMap.get(setRow.exercise_id);
        return nextId && !setRow.is_completed
          ? {
              ...setRow,
              exercise_id: nextId,
              weight: null,
              weight_mode: null,
              machine_params: null,
              replacement_original_weight:
                setRow.replacement_original_weight ?? setRow.weight,
              replacement_original_machine_params:
                setRow.replacement_original_machine_params ?? setRow.machine_params ?? null,
            }
          : setRow;
      }),
    };

    set({ activeWorkout: nextWorkout, drafts: nextDrafts });
    return accepted.size;
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
      if (!orig) return d;
      const {
        replacementOriginalWeight,
        replacementOriginalMachineParams,
        ...rest
      } = d;
      return {
        ...rest,
        exerciseId: orig,
        weight: replacementOriginalWeight ?? d.weight,
        machineParams: replacementOriginalMachineParams ?? d.machineParams ?? null,
      };
    });

    const nextWorkout: Workout = {
      ...state.activeWorkout,
      plan: { ...plan, exercises: nextExercises },
      sets: (state.activeWorkout.sets || []).map((setRow) => {
        const orig = idMap.get(setRow.exercise_id);
        if (!orig) return setRow;
        const {
          replacement_original_weight,
          replacement_original_machine_params,
          ...rest
        } = setRow;
        return {
          ...rest,
          exercise_id: orig,
          weight: replacement_original_weight ?? setRow.weight,
          machine_params:
            replacement_original_machine_params ?? setRow.machine_params ?? null,
        };
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
  resetSession: () => {
    saveRestEnd(null);
    set({
      activeWorkout: null,
      clientWorkoutId: null,
      serverWorkoutId: null,
      drafts: [],
      currentExerciseIndex: 0,
      isResting: false,
      restSecondsLeft: 0,
      restEndsAtMs: null,
    });
  },
}));
