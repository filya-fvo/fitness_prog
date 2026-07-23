import { create } from "zustand";

import type { Exercise, LocalSetDraft, Workout } from "@/types/workout";

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
  tickRest: () => void;
  stopRest: () => void;
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
    const ids = uniqueExerciseIds(get().drafts);
    set({ currentExerciseIndex: clampIndex(index, ids.length) });
  },
  nextExercise: () => {
    const ids = uniqueExerciseIds(get().drafts);
    set({ currentExerciseIndex: clampIndex(get().currentExerciseIndex + 1, ids.length) });
  },
  prevExercise: () => {
    const ids = uniqueExerciseIds(get().drafts);
    set({ currentExerciseIndex: clampIndex(get().currentExerciseIndex - 1, ids.length) });
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
      currentExerciseIndex: clampIndex(currentExerciseIndex ?? 0, uniqueExerciseIds(drafts).length),
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
  startRest: (seconds) => set({ isResting: true, restSecondsLeft: seconds }),
  tickRest: () => {
    const left = get().restSecondsLeft;
    if (left <= 1) {
      set({ isResting: false, restSecondsLeft: 0 });
      return;
    }
    set({ restSecondsLeft: left - 1 });
  },
  stopRest: () => set({ isResting: false, restSecondsLeft: 0 }),
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
